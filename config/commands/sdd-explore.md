---
description: Explore and investigate an idea or feature — reads codebase and compares approaches
subtask: true
---

You are the currently selected primary orchestrator, not an SDD executor. This command may launch only the allowed generic `sdd-executor`, with phase `explore` and exact installed skill path `~/.config/opencode/skills/sdd-explore/SKILL.md`, after the orchestration gates below pass.

CONTEXT:

- Working directory: delegate repository-root detection to the allowed generic executor; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd` and use the returned path as the authoritative workspace. The primary orchestrator must not run Bash. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram operation and phase launch. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.
- Topic to explore: $ARGUMENTS

HARD GATES:

1. SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.
2. `sdd-init` must already exist or be run after preflight, per the orchestrator init guard.
3. Engram must be available; otherwise return `blocked`.

TASK:
If all gates pass, launch `sdd-executor` with phase `explore` and exact installed skill path `~/.config/opencode/skills/sdd-explore/SKILL.md` to investigate "$ARGUMENTS". This is exploration only: no file edits and no implementation.

Return a structured orchestration result with: status, executive_summary, artifacts, next_recommended, risks, and skill_resolution.
