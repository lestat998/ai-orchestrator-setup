---
description: Start a new SDD change — runs exploration then creates a proposal
---

Follow the SDD orchestrator workflow for starting a new change named "$ARGUMENTS".

HARD GATE:
SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.

WORKFLOW:

1. Launch the allowed generic `sdd-executor` with phase `explore` and exact installed skill path `~/.config/opencode/skills/sdd-explore/SKILL.md` to investigate the codebase for this change
2. Present the exploration summary to the user
3. Launch the allowed generic `sdd-executor` with phase `propose` and exact installed skill path `~/.config/opencode/skills/sdd-propose/SKILL.md` to create a proposal based on the exploration
4. Present the proposal summary and ask the user if they want to continue with specs and design

CONTEXT:

- Working directory: delegate repository-root detection to the allowed generic executor; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd` and use the returned path as the authoritative workspace. The primary orchestrator must not run Bash. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram operation and phase launch. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.
- Change name: $ARGUMENTS
- Execution mode: ask/cache per orchestrator
- Persistence: Engram (mandatory)
- Delivery strategy: ask/cache per orchestrator
- Review budget: ask/cache per orchestrator

ENGRAM NOTE:
Sub-agents persist each phase with topic key `sdd/$ARGUMENTS/{type}`.

Read the orchestrator instructions to coordinate this workflow. Do NOT execute phase work inline — delegate to sub-agents.
