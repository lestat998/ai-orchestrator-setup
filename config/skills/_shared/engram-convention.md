# Engram Artifact Convention (reference documentation)

NOTE: Critical engram calls (`mem_search`, `mem_save`, `mem_get_observation`) are inlined directly in each skill's SKILL.md. This document is supplementary reference — sub-agents do NOT need to read it to function.

## Naming Rules

ALL SDD artifacts persisted to Engram MUST follow this deterministic naming:

```
title:     sdd/{change-name}/{artifact-type}
topic_key: sdd/{change-name}/{artifact-type}
type:      architecture
project:   {exact project returned by mem_current_project/Engram}
scope:     project
capture_prompt: false
```

Change specs remain isolated deltas at `sdd/{change-name}/spec`; a rebase replaces a stale active delta before archive. Canonical current specs use the single stable topic `sdd/specs/manifest`, advanced only by atomic `mem_save.expected_revision` CAS.

Archived full-spec versions use a unique deterministic topic per domain, change, and archive generation:

```
title:     sdd/specs/{domain}/versions/{change-name}/generations/{archive-generation}
topic_key: sdd/specs/{domain}/versions/{change-name}/generations/{archive-generation}
type:      architecture
project:   {exact project returned by mem_current_project/Engram}
scope:     project
capture_prompt: false
content:   domain + archived change + archive generation/operation ID + artifact lineage + parent immutable-version metadata + complete merged specification
```

Archive reports are likewise immutable and generation-specific at `sdd/{change-name}/archive-reports/{archive-generation}`. Neither versions nor reports use upsert semantics. Create every report, including missing-report recovery, with `expected_revision: 0`; on `revision_conflict`, retrieve the winner and reuse it only when its exact generation, operation ID, artifact IDs, immutable version IDs/content and parent metadata, baselines, and manifest result are identical. Any mismatch blocks.

```
mem_save(
  title: "sdd/{change-name}/archive-reports/{archive-generation}",
  topic_key: "sdd/{change-name}/archive-reports/{archive-generation}",
  expected_revision: 0,
  type: "architecture",
  project: "{project}",
  capture_prompt: false,
  content: "{deterministic report with exact generation/artifact/version lineage}"
)
```

The canonical manifest has this shape and its Engram observation has `revision_count`:

```yaml
manifest: sdd/specs/manifest
domains:
  {domain}:
    version_observation_id: {immutable-version-observation-id}
    version_sync_id: {immutable-version-sync-id}
    generation: {archive-generation}
```

Resolve the manifest once, then retrieve each relevant immutable version directly by the manifest's observation ID. Never use `mem_search` to enumerate versions. A change spec records the observed manifest baseline once and each domain's parent reference:

```yaml
manifest_baseline:
  observation_id: {exact-manifest-observation-id-or-null}
  sync_id: {exact-manifest-sync-id-or-null}
  revision_count: {manifest-revision-or-0}
domain_parents:
  {domain}:
    version_observation_id: {manifest-version-observation-id-or-null}
    version_sync_id: {manifest-version-sync-id-or-null}
    generation: {manifest-generation-or-null}
```

Revision `0` means create-if-absent for both an absent manifest and every immutable archive report. Archive creates all affected immutable versions, preserves every unaffected manifest entry, then calls exactly once `mem_save(topic_key: "sdd/specs/manifest", expected_revision: <revision_count>, ...)` with the complete updated map. After a lost publication result, retry recovery checks only affected domains. Each current affected ref must equal this generation's exact immutable version or descend from it: call `mem_get_observation` for the current ref and follow stored parent observation IDs directly until the generation version is reached, rejecting missing links, mismatches, or cycles. Never enumerate versions. Unrelated domain updates do not prevent report persistence and finalization. If the exact generation report is absent, recovery deterministically creates it from the frozen artifact IDs and exact immutable version IDs/content after this ancestry check using `expected_revision: 0`, then writes archived terminal state. If that create conflicts, recovery retrieves the winner and proceeds only when its exact generation/artifact/version lineage is identical; report preexistence is not required, but a mismatching winner blocks. If any affected ref neither equals nor descends from the generation version, the generation is aborted/conflicted and state explicitly returns to `active` with `rebase_required: true`, `reopened: false`, and cleared current-generation pointers. Orphan version evidence is audit history and never canonical.

Set `capture_prompt: false` when the Engram tool schema supports it; if an older schema rejects or does not expose the field, omit it rather than failing.

### Artifact Types

| Artifact Type | Produced By | Description |
|---------------|-------------|-------------|
| `explore` | sdd-explore | Exploration analysis |
| `proposal` | sdd-propose | Change proposal |
| `spec` | sdd-spec | Delta specifications (all domains concatenated) |
| `design` | sdd-design | Technical design |
| `tasks` | sdd-tasks | Task breakdown |
| `apply-progress` | sdd-apply | Implementation progress (one per batch) |
| `verify-report` | sdd-verify | Verification report |
| `archive-reports/{generation}` | sdd-archive | Immutable archive-generation closure with lineage |
| `state` | orchestrator / sdd-archive | Progress plus active/archiving/archived lifecycle state |



### State Artifact

```
mem_save(
  title: "sdd/{change-name}/state",
  topic_key: "sdd/{change-name}/state",
  type: "architecture",
  project: "{project}",
  capture_prompt: false,
  content: "change: {change-name}\nstate: active\nphase: {last-successful-phase-or-joined-stage}\npersistence: engram\narchive_generation: 0\narchive_operation_id: null\nreopened: false\nrebase_required: false\ndag_progress:\n  proposal: done\n  specs: done\n  design: missing\n  tasks: missing\n  apply: missing\n  verify: missing\n  archive: missing\nartifacts:\n  proposal: {observation-id-or-null}\n  specs: {observation-id-or-null}\n  design: {observation-id-or-null}\n  tasks: {observation-id-or-null}\n  apply_progress: {observation-id-or-null}\n  verify_report: {observation-id-or-null}\n  archive_report_topic: null\n  archive_report_observation_id: null\nspec_version_observation_ids: {}\ncanonical_manifest_result: null\nprior_archive_generations: []\ntasks_progress:\n  completed: []\n  pending: []\nlast_updated: {ISO timestamp}"
)
```

Create this topic on the first successful phase transition and upsert it after every later successful transition. For parallel spec/design execution, persist once after both results are available so one branch cannot overwrite the other's DAG progress. Keep `state: active` through verify. Archive first writes `state: archiving` with a unique generation and frozen artifact/baseline lineage, then writes immutable generation evidence, and finally changes that same generation to `archived`.

```text
first archive: active generation 0 -> archiving generation 1 -> archived generation 1
reopen:        archived generation 1 -> active/reopened generation 2
re-archive:    active/reopened generation 2 -> archiving generation 2 -> archived generation 2
retry:         archiving generation N -> archiving generation N -> archived generation N
conflict:      archiving/reopened generation N -> active/rebase-required/reopened-false generation N -> next attempt generation N+1
```

Recovery: `mem_search("sdd/{change-name}/state")` → `mem_get_observation(id)` → parse YAML → restore state.

Archived change artifacts under `sdd/{change-name}/...` are immutable. On explicit reopen, increment `archive_generation`, write `state: active` with `reopened: true`, record the reason/time, clear current-generation operation/report/version/manifest-result pointers, and retain older generation pointers only as history. Re-archive uses the reserved incremented generation. A manifest CAS conflict records the aborted/conflicted generation plus orphan versions in history and explicitly restores active state with `rebase_required: true` and `reopened: false`; clearing that flag consumes the reopened reservation, so rerunning `sdd-spec` and later phases leads the next archive to allocate a fresh generation. Never modify or reuse older evidence as current retry evidence.

## Recovery Protocol (2 steps)

Memory lifecycle rule (when Engram exposes lifecycle metadata/tooling):
- At session start or before architecture-sensitive work, call `mem_review` with action `list` for the current project when the tool is available.
- If `mem_review` is unavailable, do not fail the task. Continue with normal `mem_context`/`mem_search`, and still apply lifecycle metadata from any returned observations when present.
- `active` memories may be used normally.
- `needs_review` memories are stale context, not trusted facts.
- Surface `needs_review` context and verify it against current evidence before relying on it.
- Do NOT call `mem_review` with action `mark_reviewed` automatically. Only call `mark_reviewed` after explicit user confirmation or through a dedicated memory maintenance command.

```
Step 1: mem_search(query: "sdd/{change-name}/{artifact-type}", project: "{project}") → truncated preview + ID
Step 2: mem_get_observation(id: {observation-id}) → complete content
```

When retrieving multiple artifacts, group all searches first, then all retrievals:

```
STEP A — SEARCH (get IDs only):
  mem_search(query: "sdd/{change-name}/proposal", ...) → save ID
  mem_search(query: "sdd/{change-name}/spec", ...) → save ID
  mem_search(query: "sdd/{change-name}/design", ...) → save ID

STEP B — RETRIEVE FULL CONTENT (mandatory):
  mem_get_observation(id: {proposal_id})
  mem_get_observation(id: {spec_id})
  mem_get_observation(id: {design_id})
```

Loading project context:
```
mem_search(query: "sdd-init/{project}", project: "{project}") → get ID
mem_get_observation(id) → full project context
```

## Writing Artifacts

Standard write:
```
mem_save(
  title: "sdd/{change-name}/{artifact-type}",
  topic_key: "sdd/{change-name}/{artifact-type}",
  type: "architecture",
  project: "{project}",
  capture_prompt: false,
  content: "{full markdown content}"
)
```

Concrete example — saving a proposal for `add-dark-mode`:
```
mem_save(
  title: "sdd/add-dark-mode/proposal",
  topic_key: "sdd/add-dark-mode/proposal",
  type: "architecture",
  project: "my-app",
  capture_prompt: false,
  content: "## Proposal\n\nAdd dark mode toggle..."
)
```

`capture_prompt: false` is REQUIRED for SDD artifacts when the Engram tool schema supports it. Engram v1.15.3 captures user prompts by default for human/proactive saves, but SDD artifacts are automated pipeline outputs. Do not infer this from `type` because both SDD artifacts and human architecture decisions use `architecture`. If an older schema rejects or does not expose `capture_prompt`, omit it rather than failing.

Update existing artifact (when you have the observation ID):
```
mem_update(id: {observation-id}, content: "{updated full content}")
```

Use `mem_update` when you have the exact ID. Use `mem_save` with same `topic_key` for upserts.

### Browsing All Artifacts for a Change

```
mem_search(query: "sdd/{change-name}/", project: "{project}")
→ Returns all artifacts for that change
```

## Project Name Resolution (engram v1.11.0+)

Call `mem_current_project` and use its exact returned `project` value for every SDD search and save. A phase may instead consume that exact value when the orchestrator passes it. Keep the authoritative workspace path separately in `actionContext.workspaceRoot`; do not derive project identity from that path. Engram detection may use the git remote, `--project`, or `ENGRAM_PROJECT`, and Engram owns any normalization.

If the agent saves a memory under a project name that doesn't match existing observations, engram warns about potential name drift. Use `mem_merge_projects` (MCP tool) or `engram projects consolidate` (CLI) to merge variants.

## Upsert Behavior

Same `topic_key` + `project` + `scope` updates mutable change artifacts such as state. Spec-version and archive-report topic keys include `{change-name}` and `{archive-generation}` and are immutable. The canonical manifest is mutable only through one `expected_revision` CAS per archive attempt. Reopen or a conflicted attempt advances the next archive generation, so every re-archive writes new immutable evidence.

## Why This Convention

- Deterministic titles → recovery works by exact match
- `topic_key` → enables upserts without duplicates
- `sdd/` prefix → namespaces all SDD artifacts
- Two-step recovery → search previews are always truncated; `mem_get_observation` is the only way to get full content
- Lineage → archive-report includes all observation IDs for complete traceability
