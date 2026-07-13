# Engram Artifact Convention (reference documentation)

NOTE: Critical engram calls (`mem_search`, `mem_save`, `mem_get_observation`) are inlined directly in each skill's SKILL.md. This document is supplementary reference — sub-agents do NOT need to read it to function.

## Naming Rules

ALL SDD artifacts persisted to Engram MUST follow this deterministic naming:

```
title:     sdd/{change-name}/{artifact-type}
topic_key: sdd/{change-name}/{artifact-type}
type:      architecture
project:   {detected or current project name}
scope:     project
capture_prompt: false
```

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
| `archive-report/{archive-generation}` | sdd-archive | Immutable archive closure with lineage |
| `state` | orchestrator | DAG state for recovery after compaction |
| `sdd/specs/manifest` | sdd-archive | Atomic canonical map of every domain to an immutable version |

Each archive writes all affected immutable, generation-scoped observations at `sdd/specs/{domain}/versions/{change-name}/{archive-generation}`, then atomically replaces `sdd/specs/manifest` once with `mem_save(expected_revision: baseline_revision)`. The stable manifest maps every domain to its immutable version topic, ID, sync_id, and generation; unaffected entries are preserved exactly. Read only that manifest to resolve canonical state; absence means revision `0`. A CAS conflict canonically publishes none of the generation, and its immutable versions remain non-canonical evidence. Never enumerate version topics to infer canonical state.



### State Artifact

```
mem_save(
  title: "sdd/{change-name}/state",
  topic_key: "sdd/{change-name}/state",
  type: "architecture",
  project: "{project}",
  capture_prompt: false,
  content: "change: {change-name}\nstate: active\nphase: {last-phase}\narchive_generation: 0\narchive_generation_status: null\nlast_archived_generation: 0\nartifact_store: engram\ndag_progress:\n  explore: { status: done, observation_id: <id> }\n  proposal: { status: done, observation_id: <id> }\n  specs: { status: done, observation_id: <id> }\n  design: { status: missing, observation_id: null }\n  tasks: { status: missing, observation_id: null }\n  apply_progress: { status: missing, observation_id: null }\n  verify_report: { status: missing, observation_id: null }\n  archive_report: { status: missing, observation_id: null }\narchive_report:\n  generation: null\n  topic_key: null\n  observation_id: null\n  archived_at: null\n  spec_version_observation_ids: []\ntasks_progress:\n  completed: []\n  pending: []\nlast_updated: {ISO date}"
)
```

Recovery: `mem_search("sdd/{change-name}/state")` → `mem_get_observation(id)` → parse YAML → restore state.

`state` is `active`, `archiving`, or `archived`. Every successful non-archive transition keeps it active and updates `dag_progress` with the artifact's exact observation ID. Before any archive output, archive selects a generation greater than `last_archived_generation`, sets `state: archiving`, and sets `archive_generation_status: archiving`. Archive finalization sets `state: archived`, `phase: archived`, `archive_generation_status: published`, `last_archived_generation: archive_generation`, and same-generation report fields. A manifest CAS or true recovery conflict sets `archive_generation_status: aborted-conflicted`, restores `state: active`, `phase: rebase-required`, and clears current archive references plus `reopened_at` and `reopen_reason`, so spec can rerun; that generation is never reused. Active selection includes `archiving` for recovery and excludes archived changes. Reopening increments `archive_generation` above the preserved last archived value, reserves it with `archive_generation_status: pending`, sets `state: active`, `phase: reopened`, records `reopened_at` and `reopen_reason`, and clears current archive references before any artifact update; old reports remain historical.

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

`capture_prompt: false` is REQUIRED for SDD artifacts when the Engram tool schema supports it. Engram v1.15.3 captures user prompts by default for human/proactive saves, but SDD artifacts are automated pipeline outputs. Do not infer this from `type` because both SDD artifacts and human architecture decisions use `architecture`. If an older schema rejects or does not expose `capture_prompt`, omit it rather than failing. SDD additionally requires an Engram version whose `mem_save` schema exposes `expected_revision` and returns `id`, `sync_id`, and `revision_count`; missing CAS support is not backward-compatible and MUST block SDD initialization and onboarding.

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

Every SDD command and phase calls `mem_current_project` before memory work and uses the returned `project` identity for every Engram operation. This is the same Engram identity used by the plugin's remote-first detection (with Engram overrides and normalization applied by Engram). Never substitute the workspace basename. The workspace root remains separate for `actionContext` and repository operations.

If the agent saves a memory under a project name that doesn't match existing observations, engram warns about potential name drift. Use `mem_merge_projects` (MCP tool) or `engram projects consolidate` (CLI) to merge variants.

## Upsert Behavior

Same `topic_key` + `project` + `scope` updates the current observation rather than inserting a duplicate. Previous content is not retained, so archive reports and domain versions use generation-scoped topic keys and are never updated after creation. Create archive reports, including recovery-created reports, with `mem_save(expected_revision: 0)`; on `revision_conflict`, retrieve the exact-topic winner and reuse it only when its generation plus complete artifact and immutable-version lineage are identical. The canonical spec manifest is the exception: it is one stable topic updated only by `mem_save(expected_revision: <baseline>)`.

## Why This Convention

- Deterministic titles → recovery works by exact match
- `topic_key` → enables upserts without duplicates
- `sdd/` prefix → namespaces all SDD artifacts
- Two-step recovery → search previews are always truncated; `mem_get_observation` is the only way to get full content
- Lineage → archive-report includes all observation IDs for complete traceability
