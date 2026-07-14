# SDD Phase — Common Protocol

Boilerplate identical across all SDD phase skills. Sub-agents MUST load this alongside their phase-specific SKILL.md.

Executor boundary: every SDD phase agent is an EXECUTOR, not an orchestrator. Do the phase work yourself. Do NOT launch sub-agents, do NOT call `delegate`/`task`, and do NOT bounce work back unless the phase skill explicitly says to stop and report a blocker.

Project identity: use the exact Engram `project` value supplied by the orchestrator. If it is absent, call `mem_current_project` and use its exact returned `project` value. Do not derive project identity from a filesystem path; keep the workspace path only in `actionContext`.

## A. Skill Loading

1. Check if the orchestrator injected a `## Skills to load before work` block in your launch prompt. If yes, read those exact `SKILL.md` files before task-specific work.
2. If no skills block was provided, check for `SKILL: Load` instructions. If present, load those exact skill files.
3. If neither was provided, search for the skill registry as a fallback:
   a. `mem_search(query: "skill-registry", project: "{project}")` — if found, `mem_get_observation(id)` for full content
   b. Fallback: read `.atl/skill-registry.md` from the project root if it exists
   c. From the registry's skills index, match triggers to your task and read the exact listed `SKILL.md` paths.
4. If no registry exists, proceed with your phase skill only.

NOTE: the preferred path is (1) — exact skill paths selected by the orchestrator. Paths (2) and (3) are fallbacks. Searching the registry is SKILL LOADING, not delegation. If `## Skills to load before work` is present, IGNORE redundant `SKILL: Load` instructions.

## B. Artifact Retrieval

**CRITICAL**: `mem_search` returns 300-char PREVIEWS, not full content. You MUST call `mem_get_observation(id)` for EVERY artifact. **Skipping this produces wrong output.**

Retrieve `sdd/{change-name}/state` and every `sdd/{change-name}/archive-reports/*` observation before mutating a change. If state says `archived`, or a legacy change has only legacy `sdd/{change-name}/archive-report`, STOP without updates unless the prompt explicitly authorizes reopening. Finalization recovery is allowed only to archive when state says `archiving`, frozen artifact/version lineage matches, and every affected manifest ref equals or descends from that generation's immutable version. Reuse an exact matching generation report, or create the absent deterministic generation report from the validated immutable IDs with `expected_revision: 0` before writing terminal state. On report `revision_conflict`, retrieve the winner and continue only when its exact generation/artifact/version lineage is identical; a mismatch blocks. Active state plus a report never qualifies. An active state with `rebase_required: true` routes to `sdd-spec`, which must replace the stale spec artifact before later phases rerun. On explicit reopen, increment `archive_generation`, update state to active with `reopened: true`, record the reason/time, clear current generation report/version/manifest-result pointers, and preserve old pointers only as history; do not modify old reports or versions.

**Run all searches in parallel** — do NOT search sequentially.

```
mem_search(query: "sdd/{change-name}/{artifact-type}", project: "{project}") → save ID
```

Then **run all retrievals in parallel**:

```
mem_get_observation(id: {saved_id}) → full content (REQUIRED)
```

Do NOT use search previews as source material.

## C. Artifact Persistence

Every phase that produces an artifact MUST persist it. Skipping this BREAKS the pipeline — downstream phases will not find your output.

```
mem_save(
  title: "sdd/{change-name}/{artifact-type}",
  topic_key: "sdd/{change-name}/{artifact-type}",
  type: "architecture",
  project: "{project}",
  capture_prompt: false,
  content: "{your full artifact markdown}"
)
```

`topic_key` enables upserts — saving again updates, not duplicates.
`capture_prompt: false` is mandatory for SDD artifacts because they are automated pipeline outputs, not human/proactive memory saves. Set it when the Engram tool schema supports it; if an older schema rejects or does not expose the field, omit it rather than failing.

After a phase artifact is persisted successfully, the orchestrator MUST create or upsert `sdd/{change-name}/state` as `active` with that artifact's observation ID and the complete current DAG progress before reporting the transition as successful. Preserve existing archive generation/history and the current `reopened` value on every non-archive state update; an archive conflict has already consumed a reopened reservation by setting that value to `false`, and no later phase may restore it. When spec succeeds from `rebase_required: true`, clear that flag while preserving the aborted/conflicted generation history and `reopened: false`; the new spec observation supersedes the stale baseline for routing. Parallel spec/design branches return their artifact IDs first; the orchestrator writes state once after both complete. Archive alone transitions state to `archiving` and then finalizes the matching generation as `archived`.

## D. Return Envelope

> **CRITICAL — Response ordering**: Your FINAL output MUST be text (the return envelope), NOT a tool call. If you need to save to Engram (`mem_save`), do it BEFORE your final text response. Do NOT call `mem_session_summary` — that's for top-level agents only. **Why**: When a sub-agent's last action is a tool call, the parent agent receives only the tool result — your text response (the actual analysis) is lost.

Every phase MUST return a structured envelope to the orchestrator:

- `status`: `success`, `partial`, or `blocked`
- `executive_summary`: 1-3 sentence summary of what was done
- `detailed_report`: (optional) full phase output, or omit if already inline
- `artifacts`: list of Engram topic keys and observation IDs written
- `next_recommended`: the next SDD phase to run, or "none"
- `risks`: risks discovered, or "None"
- `skill_resolution`: how skills were loaded — `paths-injected` (received exact skill paths from orchestrator), `fallback-registry` (self-loaded paths from registry), `fallback-path` (loaded via SKILL: Load path), or `none` (no skills loaded)

Example:

```markdown
**Status**: success
**Summary**: Proposal created for `{change-name}`. Defined scope, approach, and rollback plan.
**Artifacts**: Engram `sdd/{change-name}/proposal` (observation #{id})
**Next**: sdd-spec or sdd-design
**Risks**: None
**Skill Resolution**: paths-injected — 3 skills (react-19, typescript, tailwind-4)
(other values: `fallback-registry`, `fallback-path`, or `none — no registry found`)
```

## E. Review Workload Guard

SDD must protect reviewer cognitive load, not only generate tasks.

- The default PR review budget is **400 changed lines** (`additions + deletions`).
- The orchestrator MUST cache a delivery strategy at session start: `ask-on-risk` (default), `auto-chain`, `single-pr`, or `exception-ok`.
- The orchestrator MUST pass `delivery_strategy` to `sdd-tasks` and the resolved decision to `sdd-apply`.
- `sdd-tasks` MUST forecast whether the planned work may exceed that budget.
- The forecast MUST include exact plain-text guard lines: `Decision needed before apply: Yes|No`, `Chained PRs recommended: Yes|No`, and `400-line budget risk: Low|Medium|High`.
- If the forecast is high, `sdd-tasks` MUST recommend chained or stacked PRs using deliverable work units.
- `sdd-apply` MUST NOT start oversized work unless the delivery strategy resolves to chained/stacked PR slices or explicitly accepted `size:exception`.
- Each chained PR slice must have a clear start, clear finish, autonomous scope, verification, and reasonable rollback.
- In a Feature Branch Chain, PR #1 targets the feature/tracker branch and later child PRs target the immediate previous PR branch; if GitHub shows previous slices in a child diff, retarget/rebase until the diff is clean.

This guard exists to reduce reviewer burnout and keep implementation delivery safe. Do not treat it as optional process noise.
