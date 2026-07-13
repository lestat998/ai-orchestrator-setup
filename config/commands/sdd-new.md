---
description: Start a new SDD change — runs exploration then creates a proposal
agent: ai-orchestrator-gpt
---

Follow the SDD orchestrator workflow for starting a new change named "$ARGUMENTS".

HARD GATE:
SDD Session Preflight must include execution mode, chained PR strategy, and review budget. If missing, ask the orchestrator preflight prompt and STOP. Confirm Engram is available; do not offer another backend.

WORKFLOW:

1. Launch `sdd-executor-gpt` with phase `explore` and the installed `sdd-explore/SKILL.md`
2. Present the exploration summary to the user
3. Launch `sdd-executor-gpt` with phase `propose` and the installed `sdd-propose/SKILL.md`
4. Present the proposal summary and ask the user if they want to continue with specs and design

CONTEXT:

- Working directory: before doing anything else, run `git rev-parse --show-toplevel 2>/dev/null || pwd` with your bash tool and use the returned path as the authoritative workspace. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: before any memory operation, call `mem_current_project` and use its returned `project` identity for every Engram operation and executor launch. Never use the workspace basename as the Engram project; keep the workspace path separate for `actionContext`.
- Change name: $ARGUMENTS
- Execution mode: ask/cache per orchestrator
- Delivery strategy: ask/cache per orchestrator
- Review budget: ask/cache per orchestrator

ENGRAM NOTE:
Executors persist with topic keys `sdd/$ARGUMENTS/explore` and `sdd/$ARGUMENTS/proposal`; the orchestrator persists `sdd/$ARGUMENTS/state` with `state: active`.

Read the orchestrator instructions to coordinate this workflow. Do NOT execute phase work inline — delegate to sub-agents.
