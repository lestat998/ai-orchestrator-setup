---
name: sdd-archive
description: "Archive a completed SDD change with an Engram closure report. Trigger: orchestrator launches archive after implementation and verification."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: gentleman-programming
  version: "3.0"
  delegate_only: true
---

> **Phase header**: See `skills/_shared/sdd-phase-header.md` for the shared
> Orchestrator Gate, Executor Override, and Language Domain Contract.
> Phase: `archive` · Sub-agent: `sdd-executor`.

## Purpose

Close a completed SDD change by validating its persisted task and verification evidence, creating generation-scoped immutable domain specs, then saving a closure report at `sdd/{change-name}/archive-report/{generation}`.

## What You Receive

- Change name and project
- Structured status from `skills/_shared/sdd-status-contract.md`
- Any explicit non-critical partial-archive or stale-checkbox reconciliation text

## Required Artifacts

Retrieve full observations for `proposal`, `spec`, `design`, `tasks`, `apply-progress` when present, and `verify-report`. Tasks and verify-report are mandatory. Retrieve exactly `sdd/specs/manifest` (or confirm that exact topic is absent), every immutable version referenced by the spec's affected-domain baseline, and same-generation versions on recovery. Record the archive generation, every source, manifest CAS baseline/result, and every resulting immutable version ID/sync_id in the archive report. Never enumerate version topics.

## Archive Generation and Retry Gate

Before normal archive work, retrieve the full state. `archive_generation` is a monotonically increasing integer, initialized to `0` for a new change; `last_archived_generation` is also initialized to `0` and changes only after successful finalization.

- If state is `archived`, retrieve only the report referenced by state. Require its generation to equal `archive_generation`, validate its lineage, and return the prior success without writing anything.
- If state is `archiving`, this is recovery of exactly `archive_generation`; never increment it. Retrieve only `sdd/{change-name}/archive-report/{archive_generation}` when present, same-generation version topics, the exact manifest, and any immutable parent chain needed for affected-domain validation. For each affected domain, accept either the exact published generation version or a descendant whose immutable parent chain reaches that exact version. Ignore unrelated manifest revisions and unaffected-domain changes after publication. After every source, CAS baseline/result, and version is validated, validate and reuse a matching report or, if it is absent, deterministically construct and create that generation's report with `mem_save(expected_revision: 0)` from the validated evidence before finalization. On `revision_conflict`, retrieve the winning observation at that exact report topic and call `mem_get_observation` for its full content; continue only if its generation, complete artifact/source observation-ID set, and complete immutable-version topic/ID/sync_id/parent lineage are identical to the deterministic report; otherwise return `blocked`. Derive its publication revision as the recorded baseline revision plus one and its completion date from persisted `archive_started_at`; never substitute retry-time values. If any affected-domain ref is missing or its immutable parent chain does not reach the generation version, set `archive_generation_status: aborted-conflicted`, restore `state: active`, set `phase: rebase-required`, clear current archive references plus any reopen reservation metadata, and require `sdd-spec`; never retry publication from a partial pre-CAS state.
- If state is `active`, reports and versions from older generations are history, not retry evidence. Run all read-only gates, then prepare the operation before any archive version or report write: increment when `archive_generation == last_archived_generation` or `archive_generation_status == aborted-conflicted`; reuse a greater generation only when reopen reserved it with a pending status. Persist `state: archiving`, `phase: archiving`, `archive_generation_status: archiving`, `archive_started_at`, and cleared current archive-report/version references.
- If a current-generation report or version exists but its generation, change/project identity, source IDs, parent baselines, lineage resolution, topic, or full resulting content differs, return `blocked`; never replace it or borrow evidence from another generation.
- Finalization-only recovery is prohibited for `active` state and for any report whose generation does not exactly match state.

## Task Completion Gate

Inspect the full tasks observation. If any implementation task remains unchecked:

1. Stop and return `blocked`.
2. Require `sdd-apply` to update the persisted tasks observation.
3. Reconcile stale checkboxes only when the orchestrator explicitly authorizes it and apply-progress plus verify-report prove completion. Record the exact reason and evidence IDs.

Internal todo state is not completion evidence. The tasks observation is authoritative.

## Verification Gate

- CRITICAL issues or a failing/ambiguous verify-report always block archive and have no override.
- Missing proposal, spec, or design must be reported. Continue only with explicit intentional partial-archive approval.
- A non-critical partial archive must be marked `intentional-with-warnings` and include the user's reason.

## Spec Lineage Gate

Before creating any domain version:

1. Read the required `specBaseline` manifest observation ID, sync_id, revision_count, and all affected-domain immutable version refs from the change spec. Manifest absence is valid only with null IDs and revision `0`; an absent domain entry must be explicit.
2. Retrieve exactly `sdd/specs/manifest` in full, or confirm it is absent. Before writing any version, require its ID, sync_id, revision_count, and affected-domain refs to match the complete recorded baseline.
3. Require `relationships.conflictsWith` to be empty after fresh status reconstruction.
4. On recovery after publication, validate only affected domains. For each one, require the current manifest ref either to equal this generation's exact immutable version ID/sync_id or to name a descendant whose immutable parent chain reaches that exact version. Unaffected entries and unrelated manifest revision advances are irrelevant. A missing affected-domain ref or a chain that terminates without the exact generation version is a true conflict that aborts the generation and requires a fresh spec/rebase.

If a marker is missing/malformed, the exact manifest baseline does not match before the first version write, or an unresolved explicit conflict exists, stop before ALL version writes, archive-report persistence, and archived-state updates. Return `blocked` and require a fresh spec/rebase or conflict resolution. Partial-archive approval does not override this gate. Never update or overwrite a domain version.

## Action Context Guard

If `actionContext.mode` is `workspace-planning`, stop. If `allowedEditRoots` exists, any exceptional implementation edit must remain inside it. Normal archive work does not edit project files.

## Execution Steps

1. Load skills using shared Section A.
2. Retrieve every artifact using shared Section B; never use previews.
3. Enforce task, verification, spec-lineage, partial-archive, retry, and action-context gates.
4. For a new operation only, persist the `archiving` state transition, `archive_generation_status: archiving`, and new or reopen-reserved generation defined above. Stop if that state write fails. Recovery uses the generation already stored in `state: archiving`.
5. Only after the spec-lineage gate passes for every domain, deterministically apply each verified delta to its recorded baseline and create all immutable observations at `sdd/specs/{domain}/versions/{change-name}/{archive_generation}`. Each MUST include `domain`, `changeName`, `archiveGeneration`, parent version ID/sync_id/generation, manifest baseline metadata, all source IDs, and the full resulting specification. For an absent domain baseline, create a root version. Reuse an existing same-generation topic only when its full content, sources, and parent metadata exactly match; otherwise abort the generation. Never upsert or mutate a version observation after creation.
6. After every affected immutable version exists, construct the complete next manifest by preserving every unaffected baseline entry and replacing all affected entries with their exact new topic/ID/sync_id/generation. Perform exactly one `mem_save` on `sdd/specs/manifest` with `expected_revision: specBaseline.manifestRevisionCount`. Require the returned ID, sync_id, and revision_count to match the saved manifest. Never publish per-domain pointers. If CAS conflicts, no version is canonical: persist `archive_generation_status: aborted-conflicted`, restore `state: active`, set `phase: rebase-required`, clear current archive references plus `reopened_at` and `reopen_reason`, and permit `sdd-spec` to rerun. Do not create an archive report or terminal archived state.
7. Build an archive report containing `archiveGeneration`, closure status, task totals, verification verdict, exceptions, requirement/domain summary, the complete artifact/source observation-ID set, each immutable version topic/ID/sync_id plus parent ID/sync_id/generation lineage, manifest baseline/result ID/sync_id/revision_count, and ISO completion date.
8. Create it once at `sdd/{change-name}/archive-report/{archive_generation}` with `mem_save(expected_revision: 0)`, including during recovery. On `revision_conflict`, retrieve the winning observation from that exact topic and call `mem_get_observation` for its full content; continue only when its generation, complete artifact/source observation-ID set, and complete immutable-version topic/ID/sync_id/parent lineage exactly match the deterministic report; otherwise return `blocked`. On retry after successful manifest publication, validate and reuse that identical same-generation report, or attempt the same zero-revision creation from the validated sources, versions, manifest CAS result (whose publication revision is the baseline revision plus one), and persisted `archive_started_at` when absent; never update it, use retry-time values, or use an older report.
9. Only while state remains `archiving` at the same generation and every affected manifest ref is the exact generation version or a descendant whose immutable parent chain reaches it, update `sdd/{change-name}/state` with `state: archived`, `phase: archived`, `archive_generation_status: published`, `last_archived_generation: archive_generation`, `archived_at`, archive-report generation/topic/ID, immutable spec versions, and the publication manifest ID/sync_id/revision recorded by the report, preserving artifact and task state. This idempotent finalization MUST never be followed by an active-state reconciliation.
10. Return the shared Section D envelope.

## Output Contract

```markdown
## Change Archived

**Change**: {change-name}
**Archive generation**: {generation}
**Archive report**: Engram `sdd/{change-name}/archive-report/{generation}` (observation {id})
**Status**: complete | intentional-with-warnings

### Evidence
| Artifact | Topic key | Observation ID |
|----------|-----------|----------------|
| Proposal | `sdd/{change-name}/proposal` | {id} |
| Spec | `sdd/{change-name}/spec` | {id} |
| Design | `sdd/{change-name}/design` | {id} |
| Tasks | `sdd/{change-name}/tasks` | {id} |
| Apply progress | `sdd/{change-name}/apply-progress` | {id} |
| Verify report | `sdd/{change-name}/verify-report` | {id} |

### Versioned Specifications
| Domain | Immutable topic key | Version ID / sync_id | Generation |
|--------|---------------------|----------------------|------------|
| {domain} | `sdd/specs/{domain}/versions/{change-name}/{generation}` | {id} / {sync_id} | {generation} |

Canonical manifest: `sdd/specs/manifest` ({manifest_id} / {manifest_sync_id} / revision {revision_count})

### Closure
- Tasks: {N}/{N} complete
- Verification: {PASS | PASS WITH WARNINGS}
- Exceptions: {None or exact approved text}
```

## Rules

- Never archive CRITICAL verification issues.
- Never close while the tasks observation contains unchecked implementation work.
- Never delete or rewrite prior phase observations during archive.
- Never create a version when the recorded canonical manifest baseline is missing/mismatched or while an explicit conflict remains unresolved.
- Publish all domains through one manifest `expected_revision` CAS; sequential or partial canonical publication is prohibited.
- Create every generation-scoped archive report with `expected_revision: 0`; a conflict winner is reusable only after exact generation, artifact, and immutable-version lineage validation.
- A CAS loser restores active/rebase-required state, records the generation as aborted/conflicted, and leaves all of that generation's versions non-canonical.
- After state becomes archived, all artifacts under `sdd/{change-name}/` are immutable unless an explicit reopen increments `archive_generation`, records `state: active`, `phase: reopened`, `reopened_at`, and `reopen_reason`, and clears current archive references. Older generation reports and versions remain immutable history and cannot finalize the reopened change or suppress fresh evidence.
- Persist the archive report and state update before returning text.
