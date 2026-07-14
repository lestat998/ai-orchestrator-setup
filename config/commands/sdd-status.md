---
description: Show structured SDD status for an active change
agent: ai-orchestrator-gpt
---

This command is read-only. Do not launch executors or edit files.

HARD GATE:
SDD Session Preflight must include execution mode, chained PR strategy, and review budget. If missing, ask the orchestrator preflight prompt and STOP. Confirm Engram is available.

CONTEXT:
- Delegate authoritative workspace resolution to the allowed generic read-only reviewer; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd`. The primary orchestrator must not run Bash.
- Before any memory operation, call `mem_current_project`; use its returned `project` identity for every Engram operation. Never derive the Engram project from the workspace basename. Keep the workspace path separate as `actionContext.workspaceRoot`.
- Change name: $ARGUMENTS

TASK:
1. Read the installed `_shared/sdd-status-contract.md`.
2. Resolve the change from Engram. Search topic keys, then retrieve every observation used for status in full. For domain status, read only the exact `sdd/specs/manifest`, then its referenced immutable versions; never enumerate immutable version topics.
3. If no name is supplied, select only when exactly one active change exists; otherwise ask and stop.
4. Return the complete `ai-orchestrator.sdd-status` shape with `artifactStore: engram`, topic keys, observation IDs, task progress, dependency states, `nextRecommended`, blockers, and action context.

Do not create, update, or delete observations. Report `nextRecommended` and structured dependency state as planning information only; never launch the next phase.
