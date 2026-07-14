# SDD Status and Instructions Contract

Shared Engram-backed contract for SDD commands and phase skills. Use this before acting on a change so orchestration does not guess state, artifacts, or edit scope.

## Purpose

Commands that select, continue, apply, verify, or archive an SDD change MUST first produce or consume structured status. The status is the handoff between orchestrator and phase executor.

## Change Selection

- If a change name is provided, use that exact change after confirming it exists in Engram.
- If no change name is provided, infer only when the active change is unambiguous from session state or there is exactly one active change.
- A change is `archived` only when `sdd/{change-name}/state` says `state: archived`. `state: archiving` is an active retryable archive generation and exposes `nextRecommended: archive`. `state: active` remains ordinary active work even when older reports exist; `rebase_required: true` exposes `nextRecommended: spec`, and `reopened: true` reserves its already-incremented re-archive generation. An aborted/conflicted generation MUST be represented as active with `reopened: false`; its reservation is consumed, and the next archive increments from that generation. Older generation evidence is stale. Finalization recovery is permitted only from `archiving`; a matching report may be reused, while an absent exact generation report may be created with `expected_revision: 0` only after frozen artifact/version lineage and affected manifest ancestry validate. A report create conflict requires retrieving the winner and validating identical generation/artifact/version lineage; any mismatch blocks. For legacy changes without state, legacy `sdd/{change-name}/archive-report` means archived; otherwise the change is active. Active-change selection MUST exclude archived changes.
- If multiple active changes match or the active change is unclear, ask the user to choose. Do not guess.
- If no active changes exist, report that no SDD change is active and suggest `/sdd-new <change>`.

## Status Resolution

- Resolve change artifacts with `mem_search` and `mem_get_observation`. Resolve the exact `sdd/specs/manifest` topic once, then retrieve affected domains' canonical immutable versions directly by the IDs in its map; ignore non-exact search results and never enumerate `versions/*`.
- Resolve project identity with `mem_current_project` and use the exact returned `project` value for every Engram operation. `actionContext.workspaceRoot` is a separate filesystem path and MUST NOT supply project identity.
- Do not invoke native status or continue dispatchers that cannot read Engram artifacts.
- When `blockedReasons` is non-empty, do not proceed to terminal, archive, or apply work. Return or report `blockedReasons` and stop unless `nextRecommended` is `verify`, in which case verification may run only to remediate or refresh evidence for the blockers. When `nextRecommended` is `resolve-blockers`, always report `blockedReasons` and stop. Planning tokens (`propose`, `spec-and-design`, `spec`, `design`, or `tasks`) report missing planning work; acting commands may route them, but `/sdd-status` only reports them and never launches phases.
- `nextRecommended` is a bounded machine token for routing, not human prose. Route only by `nextRecommended` and dependency states.
- Human-readable explanation belongs in `blockedReasons`, not `nextRecommended`.
- Reconstructed status MUST follow the schema below so all commands consume the same shape.

## Status Schema

Return status as markdown with these fields, or as equivalent JSON when the host supports it:

```yaml
schemaName: ai-orchestrator.sdd-status
schemaVersion: 5
changeName: <change-name-or-null>
changeState: active | archiving | archived
archiveLifecycle:
  generation: <non-negative-integer>
  operationId: <change-name>-archive-<generation> | null
  reopened: <true-or-false>
  rebaseRequired: <true-or-false>
  generationStatus: active | archiving | archived | aborted-conflicted
  reportTopic: <generation-specific-topic-or-null>
  reportObservationId: <observation-id-or-null>
artifactStore: engram
planningHome:
  mode: engram
  project: <engram-project>
changeRoot: sdd/<change-name> | null
artifactTopics:
  proposal: [sdd/<change-name>/proposal]
  specs: [sdd/<change-name>/spec]
  design: [sdd/<change-name>/design]
  tasks: [sdd/<change-name>/tasks]
  applyProgress: [sdd/<change-name>/apply-progress]
  verifyReport: [sdd/<change-name>/verify-report]
  state: [sdd/<change-name>/state]
  archiveReport: [sdd/<change-name>/archive-reports/<archive-generation>]
  specVersions: [sdd/specs/<domain>/versions/<archived-change>/generations/<archive-generation>]
  specManifest: [sdd/specs/manifest]
contextTopics:
  proposal: [<retrieved topic keys>]
  specs: [<retrieved topic keys>]
  design: [<retrieved topic keys>]
  tasks: [<retrieved topic keys>]
  applyProgress: [<retrieved topic keys>]
  verifyReport: [<retrieved topic keys>]
  state: [<retrieved topic keys>]
  archiveReport: [<retrieved topic keys>]
  specVersions: [<version topic keys referenced by state/report or deterministically resolved for the archiving generation>]
  specManifest: [<retrieved manifest topic key>]
artifactObservationIds:
  proposal: <observation-id-or-null>
  specs: <observation-id-or-null>
  design: <observation-id-or-null>
  tasks: <observation-id-or-null>
  applyProgress: <observation-id-or-null>
  verifyReport: <observation-id-or-null>
  state: <observation-id-or-null>
  archiveReport: <observation-id-or-null>
  specVersions: {<version-topic>: <observation-id>}
  specManifest: <manifest-observation-id-or-null>
canonicalManifest:
  topic: sdd/specs/manifest
  observationId: <manifest-observation-id-or-null>
  syncId: <manifest-sync-id-or-null>
  revisionCount: <non-negative-integer>
  resolution: absent | current
  domains:
    <domain>:
      versionObservationId: <immutable-version-observation-id>
      versionSyncId: <immutable-version-sync-id>
      generation: <archive-generation>
currentSpecs:
  <domain>:
    manifestObservationId: <manifest-observation-id-or-null>
    versionObservationId: <immutable-version-observation-id-or-null>
    versionSyncId: <immutable-version-sync-id-or-null>
    generation: <archive-generation-or-null>
    resolution: absent | current
artifacts:
  proposal: missing | done | partial
  specs: missing | done | partial
  design: missing | done | partial
  tasks: missing | done | partial
  applyProgress: missing | done | partial
  verifyReport: missing | done | partial
  state: missing | done | partial
  archiveReport: missing | done | partial
taskProgress:
  total: 0
  completed: 0
  pending: 0
  allComplete: false
dependencies:
  proposal: blocked | ready | all_done
  specs: blocked | ready | all_done
  design: blocked | ready | all_done
  tasks: blocked | ready | all_done
  apply: blocked | ready | all_done
  verify: blocked | ready | all_done
  archive: blocked | ready | all_done
applyState: blocked | all_done | ready
actionContext:
  mode: repo-local
  workspaceRoot: <absolute path>
  allowedEditRoots: [<absolute paths>]
relationships:
  dependsOn: []
  supersedes: []
  amends: []
  conflictsWith: []
  sameDomainActiveChanges: []
phaseInstructions:
  apply: [<instruction strings>]
  verify: [<instruction strings>]
  archive: [<instruction strings>]
nextRecommended: propose | spec-and-design | spec | design | tasks | apply | verify | archive | sdd-new | select-change | resolve-blockers | none
blockedReasons: []
```

`phaseInstructions` is optional and carries only execution-phase keys (`apply`, `verify`, `archive`). Empty topic fields MUST be arrays, not null. Missing observation IDs MUST be null. `changeName` and `changeRoot` are nullable; all other sections should be present. For an archived change, `nextRecommended` is `none`. Reopen first writes active state with an incremented generation; it is not represented as an exception to archived status. An active `rebase_required` change routes to `spec` even when a stale spec artifact exists.

Retrieve the canonical manifest once. An absent topic resolves to `absent` with revision `0`; otherwise expose its observation ID, sync ID, `revision_count`, and domain map. For each affected domain, retrieve the immutable canonical version by manifest observation ID, verify its sync ID/domain, and expose its complete specification. Versions not referenced by the manifest are audit evidence only and may be listed from state/report pointers, never discovered to choose canonical behavior. During `state: archiving`, resolve this generation's affected versions by their deterministic topics and validate their frozen artifact/parent lineage. Publication recovery is valid when each affected manifest ref equals this generation's version or its immutable parent chain reaches that version. Resolve that chain only with direct `mem_get_observation` calls by parent observation ID; never enumerate versions, and ignore unrelated domains. A missing exact generation report is not a blocker: instruct archive to create it deterministically from the validated immutable artifact/version IDs before terminal state. If any affected ref fails this check, return `dependencies.archive: ready`, `nextRecommended: archive`, and an archive phase instruction to perform aborted/conflicted recovery; status is read-only, so the archive executor must restore active/rebase-required state with `reopened: false` rather than leave the change archiving.

## Apply State

- `blocked`: Required apply artifacts are missing, task selection is ambiguous, or action context makes edits unsafe.
- `all_done`: Tasks artifact exists and every implementation task is checked `[x]`.
- `ready`: Tasks artifact exists, at least one implementation task remains unchecked, and edit scope is safe.

## Dependency States

- `proposal`, `specs`, `design`, and `tasks` report whether prerequisite artifacts are blocked, ready, or all done.
- `specs` and `design` are independently `ready` after proposal and may run in parallel. If both are missing, report `nextRecommended: spec-and-design`.
- `tasks` is `ready` only when proposal, specs, and design are all done.
- `apply` is `ready` only when proposal, specs, design, and tasks are all done and task progress is not all done.
- `verify` is `ready` when tasks exist and either apply-progress exists or the tasks artifact shows all intended implementation work complete. Incomplete tasks remain blockers for full verification.
- `archive` is `ready` only when verify-report exists, is clearly passing, and tasks are complete. A clearly passing report needs an explicit PASS/SUCCESS signal and no blocker or negation signals such as FAIL, FAILURE, BLOCKED, CRITICAL, PENDING, TODO, verification blockers, `not passed`, or `pass: no`. CRITICAL verification issues have no override. Explicit recorded exceptions are limited to non-critical partial archives or stale-checkbox reconciliation when apply-progress/verify-report prove completion.
- `archive` is blocked when `relationships.conflictsWith` or `relationships.sameDomainActiveChanges` contains any unresolved entry. Status MUST put only unresolved entries in these arrays and include an exact blocked reason requiring rebase/re-spec; archive never resolves these relationships implicitly.
- `archive` remains `ready` with `nextRecommended: archive` for `state: archiving`. Affected refs that equal or descend from this generation's immutable versions are retry-safe even when unrelated manifest entries changed; any affected ref outside that lineage routes to the archive executor solely to persist aborted/conflicted recovery to active/rebase-required state with `reopened: false`. A matching report permits finalization recovery, and an absent exact generation report is deterministically created from validated frozen artifact/version IDs before terminal state; a report from active/reopened/rebase-required state or another generation does not.
- When state is `active` with `rebase_required: true`, treat the stale spec and every downstream artifact as not satisfying dependencies, set `dependencies.specs: ready`, and return `nextRecommended: spec`; this is the routable recovery path after manifest conflict.

## Reopen Contract

Reopen is an explicit state transition, not archive recovery. From archived generation `N`, increment to `N + 1` and upsert state with `state: active`, `reopened: true`, `rebase_required: false`, the reopen reason/time, `archive_generation: N + 1`, `archive_operation_id: null`, and null current report/version/manifest-result pointers while preserving prior-generation pointers as history. Never modify old reports or versions. Re-archive transitions that reserved generation to `archiving`, so old generation evidence cannot satisfy retry or finalization checks.

## Action Context Guard

The orchestrator MUST carry `actionContext` into any phase launch.

- If manually reconstructed context cannot prove edit ownership or allowed edit roots, stop before editing.
- If `allowedEditRoots` is present, only edit files within those roots.
- If a command cannot prove a file is inside the authoritative workspace or allowed edit roots, stop and ask for clarification.

## Status Output

Every command that acts on a change MUST show status before launching an executor or performing archive work:

- Active change selection and how it was resolved.
- Artifact statuses and topic keys used as context.
- Task progress and unchecked task list when tasks exist.
- Next recommended action.
- `blockedReasons` when `nextRecommended` is not `verify`, plus any edit-root blockers.

`/sdd-status` is strictly read-only: it reports this status, including planning `nextRecommended` tokens, but MUST NOT create/update artifacts or launch any phase.
