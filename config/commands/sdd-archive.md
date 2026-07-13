---
description: Archive a completed SDD change with an Engram closure report
agent: ai-orchestrator-gpt
subtask: true
---

You are the `ai-orchestrator-gpt`, not an SDD executor. Launch `sdd-executor-gpt` with phase `archive` and the installed `sdd-archive/SKILL.md` only after all gates pass.

CONTEXT:

- Working directory: before doing anything else, run `git rev-parse --show-toplevel 2>/dev/null || pwd` with your bash tool and use the returned path as the authoritative workspace. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: before any memory operation, call `mem_current_project` and use its returned `project` identity for every Engram operation and executor launch. Never use the workspace basename as the Engram project; keep the workspace path separate for `actionContext`.

HARD GATES:

1. SDD Session Preflight must include execution mode, chained PR strategy, and review budget. If missing, ask the orchestrator preflight prompt and STOP.
2. `sdd-init` must already exist or be run after preflight, per the orchestrator init guard.
3. Resolve the active change using the status contract. If `$ARGUMENTS` is missing or ambiguous, ask the user to choose and STOP. Do not guess.
4. Reconstruct structured status from Engram before acting.
5. Tasks and verify-report observations are mandatory. Proposal/spec/design are expected; require an explicit partial-archive override when any are missing.
6. actionContext must allow archive operations. If status reports `workspace-planning`, STOP and explain that workspace archive is not supported in this slice.
7. The persisted tasks artifact must reflect completion before the archive is considered successful. Internal todos do not count, and `sdd-apply` is responsible for marking completed tasks.

DEPENDENCY CHECK:

- If the verification report is missing or does not say the change is ready, do NOT archive.
- If tasks still contains unchecked implementation items (`- [ ]`), do NOT archive by default. Send the change back to `sdd-apply` to correct the persisted tasks artifact. Only allow archive-time mechanical reconciliation when apply-progress / verify-report prove every unchecked task is complete; record the reconciliation in the archive report.
- If verify-report contains CRITICAL issues, do NOT archive. There is no CRITICAL override.
- Tell the user what is missing and suggest `/sdd-verify <change>` or `/sdd-continue <change>`.

TASK:
Launch the executor with structured status, full observation IDs, and any explicit non-critical partial-archive or stale-checkbox reconciliation text. Require it to persist `state: archiving` with a generation newer than the last archived one, create every affected immutable `sdd/specs/{domain}/versions/{change-name}/{generation}` observation, then perform exactly one `mem_save` on `sdd/specs/manifest` with the spec's recorded manifest `expected_revision`. The complete manifest must preserve unaffected domains and map every affected domain to its exact new ID/sync_id/generation; sequential domain publication is prohibited. A CAS conflict publishes none canonically, marks the generation aborted-conflicted, clears current archive references and reopen reservation metadata, restores `state: active` with `phase: rebase-required`, and permits `sdd-spec` rerun. Record version and manifest IDs/sync_ids/revision in `sdd/{change-name}/archive-report/{generation}` by creating that report with `mem_save(expected_revision: 0)`, then perform terminal `state: archived`. During finalization-only recovery, validate only affected domains and accept each exact generation version or a descendant whose immutable parent chain reaches it; unrelated manifest updates must not abort a published generation. If the same-generation report is missing after successful publication, deterministically attempt the same zero-revision creation from the validated sources, versions, and manifest CAS result. On `revision_conflict`, retrieve the exact-topic winner, call `mem_get_observation` for its full content, and finalize only if its generation, complete artifact/source observation-ID set, and complete immutable-version topic/ID/sync_id/parent lineage are identical; otherwise block.

Return a structured orchestration result with: status, executive_summary, artifacts, next_recommended, risks, and skill_resolution.
