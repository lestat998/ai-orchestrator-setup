---
description: Continue the next SDD phase in the dependency chain
agent: ai-orchestrator-gpt
---

HARD GATE:
SDD Session Preflight must include execution mode, chained PR strategy, and review budget. If missing, ask the orchestrator preflight prompt and STOP. Confirm Engram is available.

WORKFLOW:
1. Read the installed `_shared/sdd-status-contract.md` and reconstruct status from Engram topic keys plus full observations.
2. If `$ARGUMENTS` is absent and active change selection is ambiguous, ask the user and stop.
3. Follow `proposal -> [specs & design] -> tasks -> apply -> verify -> archive`. Spec and design may run in parallel, but BOTH must complete before tasks.
4. Route only by `nextRecommended` and dependency states. Handle every control/terminal token explicitly: `sdd-new` tells the user to run `/sdd-new <change>` and stops; `select-change` asks the user to choose and stops; `resolve-blockers` reports blockers and stops; `none` reports the terminal/no-op status and stops. Never construct a skill path for these tokens.
5. Only `propose`, `spec`, `design`, `tasks`, `apply`, `verify`, and `archive` are single executable phase tokens. For one of those tokens, launch `sdd-executor-gpt` with that phase and its exact installed `skills/sdd-{phase}/SKILL.md` path. Carry structured status and `actionContext` into execution phases. Reject any unknown token as a contract error; never generate a skill name from it.
6. Treat `spec-and-design` as a parallel DAG layer, not a phase name. Launch one `sdd-executor-gpt` with phase `spec` and exact path `skills/sdd-spec/SKILL.md`, and one `sdd-executor-gpt` with phase `design` and exact path `skills/sdd-design/SKILL.md`; fan them out in parallel when supported and wait for BOTH envelopes. Never look for or launch `sdd-spec-and-design`.
7. In `interactive` mode, user confirmation authorizes only the recommended layer. For `spec-and-design`, run both members of that layer, wait for both, present both envelopes, update state, then STOP and ask before routing to tasks. In `auto` mode, continue only after both succeed.
8. After every successful NON-ARCHIVE single phase, or after BOTH `spec-and-design` executors succeed, retrieve the full state and create/update `sdd/{change-name}/state` with `state: active` and current DAG progress including artifact observation IDs while preserving archive generation counters. Archive owns its `archiving` generation and terminal state updates: after archive success, retrieve the full state and require it to remain `state: archived`; never rewrite it as active. If status is already `archiving`, route only to archive retry with the same generation. If either parallel executor is partial or blocked, record only completed progress, do not mark the layer complete, present both outcomes, and stop.

CONTEXT:
- Resolve workspace with `git rev-parse --show-toplevel 2>/dev/null || pwd`.
- Before any memory operation, call `mem_current_project`; use its returned `project` identity for every Engram search/save/update and pass that identity to executors. Never derive the Engram project from the workspace basename. Keep the workspace path separate as `actionContext.workspaceRoot`.
- Change name: $ARGUMENTS
- Execution mode, delivery strategy, and review budget come from session preflight.

If `workspace-planning` has no allowed edit roots, do not launch apply, verify, or archive.
