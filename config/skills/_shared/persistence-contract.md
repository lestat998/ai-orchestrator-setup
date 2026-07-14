# Persistence Contract (shared across all SDD skills)

## Mandatory Backend

Engram is the only SDD artifact backend. The orchestrator MUST verify that Engram is available and supports atomic `mem_save.expected_revision` topic compare-and-swap before starting an SDD phase, and return `blocked` otherwise. Do not ask the user to choose an artifact store and do not create SDD artifact files in the project.

Change artifacts use deterministic topic keys and upserts. Canonical current specs use the single stable topic `sdd/specs/manifest`, whose map points each domain to an immutable version observation ID, sync ID, and generation. Archive updates every affected mapping with exactly one `mem_save(topic_key: "sdd/specs/manifest", expected_revision: <manifest-baseline-revision>)`; this one CAS is the canonical publication for the whole archive generation. Immutable version evidence remains at `sdd/specs/{domain}/versions/{change-name}/generations/{archive-generation}`, and immutable reports remain at `sdd/{change-name}/archive-reports/{archive-generation}`. Every report creation, including missing-report recovery, MUST use `mem_save(... expected_revision: 0)`. On `revision_conflict`, retrieve the winning report and continue only when its exact generation, operation ID, artifact IDs, immutable version IDs/content and parent metadata, baselines, and manifest result are identical; otherwise return `blocked`. Never enumerate version topics to determine the canonical spec.

## State Persistence (Orchestrator)

The orchestrator MUST create or update workflow state after every successful phase transition to enable status discovery and SDD recovery after compaction. State remains `active` through verify. Before archive side effects, archive MUST persist `state: archiving` with a unique/incrementing archive generation, operation ID, exact artifact observation-ID lineage, manifest baseline, and generation-specific report/version/manifest-result pointers. Only the final archive mutation changes that same generation to `archived`. If manifest CAS succeeded but report persistence was lost, an `archiving` retry validates that every affected manifest ref equals or descends from this generation's exact immutable version, deterministically creates the absent generation report from frozen artifact/version IDs with `expected_revision: 0`, and then writes terminal state; on report `revision_conflict`, it retrieves and accepts the winner only when the exact generation/artifact/version lineage is identical. It MUST NOT require a preexisting report or republish the manifest. If manifest CAS conflicts and affected-domain lineage does not prove that publication already succeeded, record that generation as aborted/conflicted and explicitly restore `state: active` with `rebase_required: true` and `reopened: false`; this consumes a reopened reservation and makes the next archive increment to a fresh generation. Never leave it `archiving`. A phase is not successfully transitioned until both its artifact and state update have persisted.

Archive is the only phase that writes `archiving` or terminal state. Orchestration MUST NOT reconcile or overwrite state to `active` after archive succeeds. Explicit reopen is separate: it increments the archived generation, writes active/reopened state, and clears current-generation evidence pointers without modifying historical evidence.

Persist state with `mem_save(topic_key: "sdd/{change-name}/state", capture_prompt: false*)`. Recover it with `mem_search("sdd/*/state")` followed by `mem_get_observation(id)`.

When spec and design run in parallel, wait for both executions to finish, combine both observation IDs and dependency outcomes, then perform one state upsert. Never let parallel branches independently overwrite the shared state topic. Interactive mode may stop after this joined state write; it must not skip the write.

*For state automated artifacts, set `capture_prompt: false` when the Engram tool schema supports it; if an older schema rejects or does not expose the field, omit it rather than failing.

## Common Rules

- Resolve project identity by calling `mem_current_project`, or consume the exact project value already returned by Engram and passed by the orchestrator. Use that exact value in every `project` argument; do not derive it from a filesystem path. Keep filesystem workspace paths only in `actionContext`.
- Persist every produced SDD artifact to Engram and return its observation ID and topic key.
- Automated SDD artifacts use `capture_prompt: false` when supported.
- Artifact persistence must happen before the final text response.
- Engram unavailability is a blocker, never an implicit ephemeral fallback.
- Missing atomic `mem_save.expected_revision` support is a blocker; do not emulate CAS with read-then-write.

## Sub-Agent Context Rules

Sub-agents launch with a fresh context and NO access to the orchestrator's instructions or memory protocol.

Who reads, who writes:
- Non-SDD (general task): orchestrator searches engram, passes summary in prompt; sub-agent saves discoveries via `mem_save`
- SDD (phase with dependencies): sub-agent reads artifacts directly from backend; sub-agent saves its artifact
- SDD (phase without dependencies, e.g. explore): nobody reads; sub-agent saves its artifact

Why this split:
- Orchestrator reads for non-SDD: it knows what context is relevant; sub-agents doing their own searches waste tokens on irrelevant results
- Sub-agents read for SDD: SDD artifacts are large; inlining them in the orchestrator prompt would consume the entire context window
- Sub-agents always write: they have the complete detail on what happened; nuance is lost by the time results flow back to the orchestrator

## Orchestrator Prompt Instructions for Sub-Agents

Non-SDD:
```
PERSISTENCE (MANDATORY):
If you make important discoveries, decisions, or fix bugs, you MUST save them to engram before returning:
  mem_save(title: "{short description}", type: "{decision|bugfix|discovery|pattern}",
           project: "{project}", content: "{What, Why, Where, Learned}")
Do NOT return without saving what you learned. This is how the team builds persistent knowledge across sessions.
```

SDD (with dependencies):
```
Read these artifacts before starting (search returns truncated previews):
  mem_search(query: "sdd/{change-name}/{type}", project: "{project}") → get ID
  mem_get_observation(id: {id}) → full content (REQUIRED)

PERSISTENCE (MANDATORY — do NOT skip):
After completing your work, you MUST call:
  mem_save(
    title: "sdd/{change-name}/{artifact-type}",
    topic_key: "sdd/{change-name}/{artifact-type}",
    type: "architecture",
    project: "{project}",
    capture_prompt: false,
    content: "{your full artifact markdown}"
  )
If you return without calling mem_save, the next phase CANNOT find your artifact and the pipeline BREAKS.
```

SDD (no dependencies):
```
PERSISTENCE (MANDATORY — do NOT skip):
After completing your work, you MUST call:
  mem_save(
    title: "sdd/{change-name}/{artifact-type}",
    topic_key: "sdd/{change-name}/{artifact-type}",
    type: "architecture",
    project: "{project}",
    capture_prompt: false,
    content: "{your full artifact markdown}"
  )
If you return without calling mem_save, the next phase CANNOT find your artifact and the pipeline BREAKS.
```

For SDD artifacts, `capture_prompt: false` is explicit and mandatory when the Engram tool schema supports it. Engram v1.15.3 defaults `capture_prompt` to true for normal human/proactive saves, but automated pipeline artifacts must not capture the user's prompt. Do not infer this from `type` because SDD artifacts and real human architecture decisions both use `architecture`. If an older schema rejects or does not expose `capture_prompt`, omit it rather than failing.

## Sub-Agent Response Ordering

When a sub-agent persists artifacts, the persistence call MUST happen BEFORE the final text response. The sub-agent's absolute last output must be text, never a tool call.

**Why**: The Task tool returns the sub-agent's final output to the parent. If the sub-agent ends with a tool call, the parent receives only the tool result (e.g., `"Observation saved"`) — the sub-agent's text analysis is lost. Always: do your work → save → respond with text envelope.

Sub-agents must NOT call `mem_session_summary` — that's reserved for top-level agents only.

## Skill Registry

The orchestrator pre-resolves skill paths from the skill registry and injects them as `## Skills to load before work` in your launch prompt. Sub-agents read those exact `SKILL.md` files before task-specific work.

To generate/update: run the `skill-registry` skill, or run `sdd-init`.

Sub-agent skill loading: check for a `## Skills to load before work` block in your prompt — if present, read those exact files. If not present, check for `SKILL: Load` instructions as a fallback. If neither exists, proceed without — this is not an error.

## Detail Level

The orchestrator may pass `detail_level`: `concise | standard | deep`. This controls output verbosity but does NOT affect what gets persisted — always persist the full artifact.
