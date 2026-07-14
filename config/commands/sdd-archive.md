---
description: Archive a completed SDD change with an Engram lineage report
subtask: true
---

You are the currently selected primary orchestrator, not an SDD executor. This command may launch only the allowed generic `sdd-executor`, with phase `archive` and exact installed skill path `~/.config/opencode/skills/sdd-archive/SKILL.md`, after the orchestration gates below pass.

CONTEXT:

- Working directory: delegate repository-root detection to the allowed generic executor; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd` and use the returned path as the authoritative workspace. The primary orchestrator must not run Bash. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram operation and phase launch. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.

HARD GATES:

1. SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.
2. `sdd-init` must already exist or be run after preflight, per the orchestrator init guard.
3. Resolve the active change using the status contract. If `$ARGUMENTS` is missing or ambiguous, ask the user to choose and STOP. Do not guess.
4. Produce structured status from Engram before acting.
5. The active change must have tasks and verify-report artifacts. Proposal/spec/design are expected for full archive; if missing, require an explicit user override.
6. actionContext must allow archive operations. If status reports `workspace-planning`, STOP and explain that workspace archive is not supported in this slice.
7. The persisted tasks artifact must reflect completion before the archive is considered successful. Internal todos do not count, and `sdd-apply` is responsible for marking completed tasks.
8. Finalization recovery is allowed only when state is `archiving`, frozen artifact/version lineage matches, and every affected manifest ref equals or descends from this generation's immutable version. Reuse an exact matching report; if its deterministic generation topic is absent, create it from the validated immutable IDs with `expected_revision: 0` before terminal state. On report `revision_conflict`, retrieve the winner and continue only when its exact generation/artifact/version lineage is identical; otherwise block. Active or reopened state never qualifies.
9. Engram must expose atomic `mem_save.expected_revision`; never emulate canonical-manifest CAS.

DEPENDENCY CHECK:

- If the verification report is missing or does not say the change is ready, do NOT archive.
- If tasks still contains unchecked implementation items (`- [ ]`), do NOT archive by default. Send the change back to `sdd-apply` to correct the persisted tasks artifact. Only allow archive-time mechanical reconciliation when apply-progress / verify-report prove every unchecked task is complete; record the reconciliation in the archive report.
- If verify-report contains CRITICAL issues, do NOT archive. There is no CRITICAL override.
- Tell the user what is missing and suggest `/sdd-verify <change>` or `/sdd-continue <change>`.

TASK:
If all gates pass, launch `sdd-executor` with phase `archive`, exact installed skill path `~/.config/opencode/skills/sdd-archive/SKILL.md`, structured status, all artifact topic keys, and any explicit non-critical partial-archive or stale-checkbox reconciliation text. It must persist `state: archiving`, create all immutable generation evidence, publish every affected domain with exactly one `mem_save` CAS of `sdd/specs/manifest`, create the matching report with `expected_revision: 0`, and finally mark that generation archived. On retry, affected-domain immutable parent chains may prove a lost successful publication without comparing unrelated domains or republishing; if the report write was also lost, it must deterministically create the absent generation report from frozen artifact/version IDs with `expected_revision: 0` before terminal state. Any report `revision_conflict` winner must be retrieved and accepted only when its exact generation/artifact/version lineage is identical. Otherwise it must block or mark a manifest-conflicted generation aborted/conflicted as applicable; manifest conflicts explicitly return state to `active` with `rebase_required: true` and `reopened: false`, so status routes back to spec and the next archive allocates a fresh generation. It must never leave state `archiving` after a manifest conflict. Never perform a post-success active-state reconciliation.

Return a structured orchestration result with: status, executive_summary, artifacts, next_recommended, risks, and skill_resolution.
