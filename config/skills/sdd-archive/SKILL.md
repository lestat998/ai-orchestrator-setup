---
name: sdd-archive
description: "Archive a completed SDD change with an Engram lineage report. Trigger: orchestrator launches archive after implementation and verification."
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

Close a completed SDD change through a retry-safe archive generation: validate evidence, persist `archiving` state, create all immutable generation evidence, publish every affected domain atomically through one canonical manifest CAS, persist the closure report, and finally mark that generation archived. Archiving does not modify project files.

## What You Receive

- Change name and Engram project
- Structured status from `skills/_shared/sdd-status-contract.md`
- Any explicit intentional partial-archive or stale-checkbox reconciliation text

## Required Artifacts

Retrieve full content and observation IDs for `sdd/{change-name}/proposal`, `spec`, `design`, `tasks`, `apply-progress`, `verify-report`, and `state`, plus the exact current-generation report topic when it exists. Retrieve exactly `sdd/specs/manifest` once or confirm it is absent, then retrieve affected canonical versions directly by the IDs in that manifest. For an `archiving` retry, also resolve each affected generation version by its deterministic topic from frozen state; never enumerate immutable spec versions. Tasks and a passing verify report are mandatory.

## Hard Gates

- STOP if any implementation task remains unchecked. Only reconcile stale checkboxes when apply-progress and verify-report prove completion and the orchestrator explicitly authorizes it; update the tasks observation and record the reason.
- STOP for any CRITICAL verification issue. There is no override.
- STOP unless the verify report has an explicit PASS/SUCCESS signal and no failure, blocked, pending, or negated-pass signal.
- STOP when `actionContext.mode` is `workspace-planning` or edit ownership is unsafe.
- Preserve strict TDD evidence and verification results in the archive report.
- STOP without mutation if state already says archived. An explicitly reopened state is active work for its newly reserved generation; an older report or version never authorizes recovery for it.
- STOP if `relationships.conflictsWith` or `relationships.sameDomainActiveChanges` contains any unresolved entry. Require rebase/re-spec; archive MUST NOT choose a winner or silently overwrite another change.
- STOP if the spec omits its manifest baseline observation ID, sync ID, or revision count, or if any domain omits its immutable parent ID/sync ID/generation. A changed manifest requires rebase/re-spec; archive MUST NOT overwrite it without CAS.

## Execution Steps

1. Load skills via shared Section A and retrieve every artifact via Section B. Parse `manifest_baseline.observation_id`, `sync_id`, and `revision_count` once from `sdd/{change-name}/spec`; require each domain's `domain_parent.domain`, `version_observation_id`, `version_sync_id`, and `generation` fields, including explicit nulls.
2. Validate task completion, verification verdict, action context, terminal state, relationships, manifest/domain baselines, and any partial-archive approval without mutation.
3. Establish the archive generation before any other side effect:
   - From ordinary `state: active`, set `archive_generation` to the previous value plus one.
   - From an explicit reopened state, use the generation already incremented and reserved by reopen.
   - An aborted/conflicted generation is consumed. Its restored active state MUST have `reopened: false`, so the next archive follows the ordinary active rule and allocates the next generation rather than reusing the aborted reservation.
   - From `state: archiving`, reuse only that exact generation as a retry; never increment it, replace its frozen artifact/baseline lineage, or clear its report/version pointers. Block if current artifacts no longer match that frozen lineage, except for the authorized step 5 checkbox reconciliation.
   - From active/reopened state, including a prior `rebase_required` flow whose spec has now been replaced, upsert `state: archiving` with `rebase_required: false`, `archive_generation`, `archive_operation_id: {change-name}-archive-{generation}`, exact artifact lineage, recorded manifest/domain baselines, empty current-generation version/manifest-result pointers, and its generation-specific report topic. This write MUST succeed before later side effects. For a retry, validate the existing frozen lineage instead of rewriting it.
4. Finalization recovery is allowed only when state was already `archiving`. Resolve every frozen artifact ID and every affected immutable version from its deterministic generation topic, and require exact change, generation, operation ID, baselines, parent metadata, artifact lineage, and complete version content. Retrieve the canonical manifest and apply the affected-domain parent-chain validation from step 6. If a matching generation report exists, require its exact generation, artifact, and immutable-version lineage and perform only step 11. If the exact report topic is absent and every affected manifest ref equals or descends from this generation's exact version, deterministically build the missing report from the frozen artifact IDs, immutable version IDs/content, generation/operation ID, baselines, and validated manifest result, then create it with `mem_save(topic_key: "sdd/{change-name}/archive-reports/{archive-generation}", expected_revision: 0, ...)`. On `revision_conflict`, retrieve the winning report and continue only if its exact generation, operation ID, artifact IDs, immutable version IDs/content and parent metadata, baselines, and manifest result are identical; otherwise return `blocked`. Then perform step 11. Do not rerun merges or republish the manifest. Reports are immutable.
5. If authorized stale-checkbox reconciliation is needed, update the tasks observation, then update the same `archiving` state generation with the resulting tasks observation ID before continuing. Any other artifact-lineage drift blocks the attempt.
6. Immediately before merging, retrieve the canonical manifest once. It must match the spec baseline ID, sync ID, and revision count; absent must match null/null/0. Verify every affected domain entry matches its recorded immutable parent reference. The only retry exception applies when this generation's complete deterministic immutable version set already exists, proving publication may have succeeded before its result was recorded. Validate only affected domains: each current manifest ref must either equal this generation's exact version observation ID/sync ID/generation or be a descendant whose immutable parent chain reaches that version. Starting from each current ref, call `mem_get_observation` with its observation ID, verify the domain and sync ID, and follow each stored parent `version_observation_id` directly until this generation's exact version is reached. Never enumerate or broadly search version topics; only exact deterministic current-generation topic resolution is allowed. Reject missing parents, domain/sync mismatches, or cycles. Unaffected manifest entries and revisions are irrelevant to this recovery check. If every affected ref passes, reuse the exact immutable versions, skip merging and the manifest `mem_save`, capture the current manifest as the resulting manifest, and continue with the success/report branch of step 10.
7. If the manifest or any affected parent differs for any other reason before version creation, append this generation to history as `status: aborted-conflicted` with its operation ID, frozen baseline, and observed manifest identity; then explicitly restore `state: active` with `rebase_required: true`, `reopened: false`, and `archive_operation_id: null`, and clear current report/version/manifest-result pointers. This consumes any reopened reservation, so the next archive allocates generation `N + 1`. Return `blocked` with `next_recommended: sdd-spec`. Do not create replacement evidence or attempt an unguarded write; never leave state `archiving`.
8. Only after all domains pass the baseline and relationship gates, merge each domain deterministically:
   - A full new-domain spec becomes complete version content after removing the change-only `manifest_baseline` and `domain_parent` metadata blocks.
   - `ADDED` appends complete requirement blocks and MUST fail on duplicate requirement names.
   - `MODIFIED` replaces the complete current requirement block with the same name and MUST fail when the target is missing or ambiguous.
   - `REMOVED` deletes the named current requirement block and MUST fail when the target is missing or ambiguous.
   - `RENAMED` renames exactly the named current requirement and MUST fail when the source is missing, ambiguous, or the destination already exists.
   - Never guess through malformed or ambiguous deltas. Stop before writing any spec version if all domain merges cannot be resolved safely.
9. Persist every merged full spec as immutable evidence at `sdd/specs/{domain}/versions/{change-name}/generations/{archive-generation}` before canonical publication. Include domain, change, generation/operation ID, artifact lineage, manifest baseline, domain parent version ID/sync ID/generation, and complete merged specification. Reuse an existing topic only when all content and lineage match exactly; capture every observation ID and sync ID. Do not publish until the complete affected-domain version set exists.
10. Build the complete next manifest by preserving every unaffected mapping and replacing every affected domain mapping with this generation's exact immutable version observation ID, sync ID, and generation. Perform exactly ONE canonical publication call: `mem_save(topic_key: "sdd/specs/manifest", expected_revision: <spec-manifest-baseline-revision>, ...)`. Revision `0` means create-if-absent. Never loop over domains or make a second manifest `mem_save` in this archive attempt.
    - On success, capture the resulting manifest observation ID, sync ID, and revision count. Deterministically create the immutable generation report from the frozen artifact IDs, exact baseline, complete immutable affected version set, and resulting manifest identity/map with `mem_save(topic_key: "sdd/{change-name}/archive-reports/{archive-generation}", expected_revision: 0, ...)`; derive report timestamps and publication evidence from persisted generation/version observations, never from the retry clock or attempt path. On `revision_conflict`, retrieve the winning report and continue only if its exact generation, operation ID, artifact IDs, immutable version IDs/content and parent metadata, baselines, and manifest result are identical; otherwise return `blocked`. Then update `archiving` state with the winning report, version pointers, and manifest result. If the report write result was lost, step 4 recovers that same report from the immutable IDs after validating publication lineage. A report is reusable only on an exact match.
    - On `revision_conflict`, retrieve the current manifest and apply the affected-domain parent-chain check from step 6. If every affected ref equals or descends from this generation's exact immutable version, publication already succeeded: do not republish, ignore unrelated domain updates, capture the current manifest result, and continue with report persistence and finalization. If any affected ref does not reach this generation's version, append the generation to history as `status: aborted-conflicted` with its operation ID, frozen baseline, orphan version pointers, and observed conflict identity; then explicitly restore `state: active` with `rebase_required: true`, `reopened: false`, and `archive_operation_id: null`, clear current report/version/manifest-result pointers, and return `blocked` with `next_recommended: sdd-spec`. This consumes a reopened reservation and forces the next archive to allocate a fresh generation. Never leave state `archiving`.
11. As the final mutation, update `sdd/{change-name}/state` from `archiving` to `state: archived` only when its generation, operation ID, frozen lineage, and report topic still match and the exact report now exists. Include archive date, generation, operation ID, report topic/actual observation ID, every generation-specific version topic/observation ID, and the resulting manifest observation ID/sync ID/revision count. The prior state need not already contain the report observation ID; the terminal write records it atomically. This terminal write is retryable only for that generation.
12. Return the shared Section D envelope.

## Archive Report

Include:

- Change name, archive date derived from persisted generation evidence, archive generation, operation ID, final verdict, and whether closure is complete or intentional-with-warnings.
- `change_state: archived`.
- `archive_report_topic: sdd/{change-name}/archive-reports/{archive-generation}`; the actual report observation ID is captured in terminal state and the return envelope.
- Artifact table with every topic key and observation ID.
- Spec-version table with each immutable topic, observation ID/sync ID, generation, operation ID, artifact lineage, and parent immutable-version metadata.
- Canonical-manifest section with `sdd/specs/manifest`, baseline ID/sync/revision, resulting ID/sync/revision, complete affected-domain version set, and publication evidence derived from the validated manifest lineage rather than the current attempt path.
- Task totals and any checkbox reconciliation reason.
- Verification commands/results, strict TDD evidence status, warnings, and accepted exceptions.
- Final dependency state and recommended next action.

## Rules

- The archive report is the audit trail; never omit artifact lineage.
- Reports and spec versions are immutable from creation. Every report creation, including missing-report recovery, uses `expected_revision: 0`; a conflict winner may be reused only when its generation, operation ID, artifact lineage, immutable-version lineage/content, baselines, and manifest result are identical.
- Never claim closure while the persisted tasks observation is stale.
- Never alter source code or SDD planning artifacts except an explicitly authorized mechanical task-checkbox reconciliation.
- Change deltas and archived spec versions remain immutable history; the canonical manifest may change only through one `expected_revision` CAS per archive attempt.
- A `revision_conflict` aborts the generation and explicitly consumes any reopened reservation unless every affected manifest ref equals or descends through immutable parent IDs from this generation's exact version. Unrelated domain mappings never decide retry recovery.
- After state becomes archived, never update the state, report, or any other change artifact without an explicit reopen.
- Finalization recovery requires `state: archiving`, exact frozen artifact/version lineage, and affected manifest refs that equal or descend from this generation's versions. The exact matching generation report may be reused; if its deterministic topic is absent, create it from those immutable IDs before the terminal state write. Never finalize from merely active/reopened/rebase-required state or from stale evidence belonging to an older generation.
- Persist before returning, and return `blocked` with exact reasons when any gate fails.
