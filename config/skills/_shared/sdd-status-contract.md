# SDD Status and Instructions Contract

## Purpose

Commands that select, continue, apply, verify, or archive a change MUST reconstruct structured status from Engram before acting. Status is the handoff between orchestrator and phase executor.

## Change Selection

- If a change name is provided, confirm it through `sdd/{change-name}/state` or its phase topic keys.
- Without a name, infer only when session state identifies one active change or Engram contains exactly one change whose state observation says `state: active` or `state: archiving`.
- Exclude every change whose state observation says `state: archived` from active selection.
- If multiple changes match, ask the user to choose and stop.
- If none exists, report no active SDD change and suggest `/sdd-new <change>`.
- Archived change artifacts are immutable. They may be changed only after an explicit reopen request increments `archive_generation`, updates state to `state: active` and `phase: reopened`, records `reopened_at` plus `reopen_reason`, and clears current archive references. Prior generation reports remain historical.

Use `mem_search` to discover topic keys, then `mem_get_observation` for every observation used to determine status. Do not route from previews or free text.

## Status Schema

Return markdown with these fields, or equivalent JSON:

```yaml
schemaName: ai-orchestrator.sdd-status
schemaVersion: 5
projectIdentity:
  source: mem_current_project
  project: <engram-returned-project>
changeName: <change-name-or-null>
changeState: active | archiving | archived | null
changePhase: <phase-or-null>
archiveGeneration: <non-negative-integer>
archiveGenerationStatus: pending | archiving | published | aborted-conflicted | null
lastArchivedGeneration: <non-negative-integer>
archivedAt: <ISO-8601-or-null>
reopenedAt: <ISO-8601-or-null>
artifactStore: engram
planningHome:
  mode: engram
  topicPrefix: sdd/<change-name>/
changeRoot: sdd/<change-name>/
artifactPaths:
  proposal: [sdd/<change-name>/proposal]
  specs: [sdd/<change-name>/spec]
  design: [sdd/<change-name>/design]
  tasks: [sdd/<change-name>/tasks]
  applyProgress: [sdd/<change-name>/apply-progress]
  verifyReport: [sdd/<change-name>/verify-report]
  archiveReport: [sdd/<change-name>/archive-report/<archive-generation>]
contextFiles:
  proposal: [<observation-id>]
  specs: [<observation-id>]
  design: [<observation-id>]
  tasks: [<observation-id>]
  applyProgress: [<observation-id>]
  verifyReport: [<observation-id>]
  archiveReport: [<observation-id>]
artifacts:
  proposal: missing | done | partial
  specs: missing | done | partial
  design: missing | done | partial
  tasks: missing | done | partial
  applyProgress: missing | done | partial
  verifyReport: missing | done | partial
  archiveReport: missing | done | partial
archiveReport:
  generation: <archive-generation-or-null>
  topicKey: sdd/<change-name>/archive-report/<archive-generation> | null
  observationId: <observation-id-or-null>
  closureStatus: complete | intentional-with-warnings | null
  archivedAt: <ISO-8601-or-null>
  artifactSourceObservationIds:
    proposal: <observation-id-or-null>
    specs: <observation-id-or-null>
    design: <observation-id-or-null>
    tasks: <observation-id>
    applyProgress: <observation-id-or-null>
    verifyReport: <observation-id>
  specVersions:
    - domain: <domain>
      topicKey: sdd/specs/<domain>/versions/<change-name>/<archive-generation>
      observationId: <observation-id>
      syncId: <sync-id>
      parentObservationId: <observation-id-or-null>
      parentSyncId: <sync-id-or-null>
      parentGeneration: <generation-or-null>
      canonicalManifestTopicKey: sdd/specs/manifest
      canonicalManifestObservationId: <observation-id>
      canonicalManifestSyncId: <sync-id>
      canonicalManifestRevisionCount: <positive-integer>
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
  conflictsWith: [] # unresolved conflicts only
  sameDomainActiveChanges: [] # unresolved same-domain overlaps only
phaseInstructions:
  apply: [<instruction strings>]
  verify: [<instruction strings>]
  archive: [<instruction strings>]
nextRecommended: propose | spec | design | spec-and-design | tasks | apply | verify | archive | none | sdd-new | select-change | resolve-blockers
blockedReasons: []
```

Empty path and context fields MUST be arrays, never null. `changeName`, archive scalar fields, and archive observation IDs are nullable. `archiveGeneration` and `lastArchivedGeneration` are always present and start at `0`; `archiveReport.specVersions` is an empty array before the current generation writes. `phaseInstructions` is optional and contains only execution phases. `projectIdentity.project` MUST come from `mem_current_project`; `actionContext.workspaceRoot` is independent and MUST NOT be used as a project-name source. A manifest CAS conflict keeps the attempted generation number and sets `archiveGenerationStatus: aborted-conflicted` while returning the change to active/rebase-required state.

## Routing Rules

- Route only by `nextRecommended` and dependency states.
- After every NON-ARCHIVE executor returns `success`, the invoking command MUST retrieve and preserve the current state, then upsert `sdd/{change-name}/state` as `active` with updated DAG artifact status and exact observation ID. For a parallel layer, reconcile state after all members return; never lose one member's progress to concurrent state upserts. Archive success is terminal: retrieve and preserve its `state: archived` update and never reset it active.
- Planning dependencies follow `proposal -> [specs & design] -> tasks -> apply -> verify -> archive`.
- Spec and design may run in parallel after proposal, but BOTH must complete before tasks can start.
- Missing planning artifacts are expected outputs for their phase, not blockers.
- An archived change is terminal: set `nextRecommended: none` and do not route another phase unless the user explicitly reopens it. Reopen increments `archiveGeneration` above `lastArchivedGeneration` and reserves that value for the next archive; the old report must not populate current-generation artifact/evidence fields.
- A change in `state: archiving` routes only to `archive` for finalization when every affected manifest ref is the exact generation version or a descendant whose immutable parent chain reaches it; unrelated manifest revisions do not block recovery. A missing or unrelated affected-domain ref requires archive to mark that generation aborted-conflicted, clear current archive references and any reopen reservation metadata, and restore active/rebase-required so `sdd-spec` can rerun.
- A change in `state: active`, `phase: rebase-required`, and `archiveGenerationStatus: aborted-conflicted` routes to `spec`; the new spec replaces the manifest baseline before another archive generation may start.
- If `blockedReasons` is non-empty, do not proceed to apply or archive.
- Non-empty `relationships.conflictsWith` blocks archive. `sameDomainActiveChanges` is informational; the single atomic manifest CAS decides which concurrent archive becomes canonical.
- `verify` may run to refresh evidence when it is the recommended remediation.
- `resolve-blockers` always reports blockers and stops.

## Apply State

- `blocked`: required artifacts are missing, task selection is ambiguous, or edit context is unsafe.
- `all_done`: proposal, spec, design, and tasks exist, and every implementation task is checked `[x]`.
- `ready`: proposal, spec, design, and tasks exist, at least one task is unchecked, and edit scope is safe.

## Dependency States

- Tasks are ready only when proposal, spec, and design exist.
- Apply is ready only when proposal, spec, design, and tasks exist and work remains.
- Verify is ready when tasks exist and implementation evidence exists or tasks show all intended work complete.
- Retrieve only the exact `sdd/specs/manifest` in full, then retrieve immutable versions referenced by its domain entries. Manifest absence is revision `0`; never enumerate immutable versions to determine canonical state.
- Archive is ready only when tasks are complete, verify-report clearly passes, the recorded manifest ID/sync_id/revision and affected-domain refs match the exact canonical manifest baseline (or exact absence), and no unresolved explicit conflict remains.
- A `state: archiving` change whose exact affected-domain versions are current manifest refs or ancestors of those refs is a retryable published generation. Status MUST validate each immutable parent chain plus source/version lineage and, when a same-generation report exists, its lineage; recommend `archive` to deterministically create a missing same-generation report from validated evidence or reuse a matching one, then finish terminal finalization. A report with `state: active`, or from any older generation, is historical and MUST NOT trigger retry, count as current evidence, suppress fresh verification, or permit finalization.
- During recovery, validate only affected-domain refs against the generation versions; unrelated manifest updates and unaffected-domain changes do not abort a published generation. A missing affected ref or an immutable parent chain that does not reach the exact generation version is a true conflict: mark `aborted-conflicted`, clear current archive references and reopen reservation metadata, restore active/rebase-required, and require a fresh spec. Orphan immutable versions are never canonical evidence.
- A passing report requires explicit PASS/SUCCESS and no FAIL, FAILURE, BLOCKED, CRITICAL, PENDING, TODO, negated pass, or unresolved verification blocker.
- CRITICAL verification issues have no override. Explicit exceptions are limited to non-critical partial archive or stale-checkbox reconciliation with implementation and verification proof.

## Action Context Guard

Carry `actionContext` into every executor launch. If edit ownership or allowed roots cannot be proven, stop before editing. Never edit outside `allowedEditRoots`.

## Status Output

Before acting, show change selection, artifact topic keys and observation IDs, task progress, next action, blockers, and action context.
