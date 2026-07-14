---
description: Show structured SDD status for an active change
---

You are the currently selected primary orchestrator. This command is read-only. Do not launch SDD executors and do not edit files.

HARD GATE:

SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.

CONTEXT:

- Working directory: delegate repository-root detection to the allowed generic read-only reviewer; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd` and use the returned path as the authoritative workspace. The primary orchestrator must not run Bash.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram read. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.
- Change name: $ARGUMENTS

TASK:

1. Resolve status entirely from Engram using `mem_search`, `mem_get_observation`, and the installed `sdd-status-contract.md`. Do not invoke native dispatchers that cannot read Engram artifacts.
2. Resolve the active change:
   - If `$ARGUMENTS` is provided, validate that exact change in Engram.
   - If omitted and exactly one active change exists, select it and say how it was selected.
   - If omitted or ambiguous with multiple active changes, ask the user to choose and STOP. Do not guess.
3. Return `blocked` if Engram is unavailable.
4. Return structured status with:
   - Active change selection and schemaName.
    - planningHome, changeRoot, artifactTopics, and contextTopics.
    - Change state and archive lifecycle (generation, operation ID, reopened/rebase-required flags, matching report pointer) plus artifact statuses and observation IDs for proposal, specs, design, tasks, apply-progress, verify-report, state, generation-specific archive reports, referenced immutable spec versions, and the canonical manifest resolved once with its domain mappings.
   - Task progress: total, completed, pending, and allComplete.
   - Dependency states for proposal, specs, design, tasks, apply, verify, and archive.
   - Next recommended action.
   - actionContext mode, workspace root, and allowed edit roots.

READ-ONLY RULES:

- Do not create, update, or delete artifacts.
- Do not mark tasks complete.
- Do not launch apply, verify, archive, or continue.
- Report the bounded `nextRecommended` token and dependency states as planning information only. Never launch a phase, including for `propose`, `spec-and-design`, `spec`, `design`, or `tasks`.
- If status cannot be resolved safely, return `status: blocked` with the missing information.
