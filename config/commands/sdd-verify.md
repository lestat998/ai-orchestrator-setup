---
description: Validate implementation matches specs, design, and tasks
subtask: true
---

You are the currently selected primary orchestrator, not an SDD executor. This command may launch only the allowed generic `sdd-executor`, with phase `verify` and exact installed skill path `~/.config/opencode/skills/sdd-verify/SKILL.md`, after the orchestration gates below pass.

CONTEXT:

- Working directory: delegate repository-root detection to the allowed generic executor; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd` and use the returned path as the authoritative workspace. The primary orchestrator must not run Bash. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram operation and phase launch. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.

HARD GATES:

1. SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.
2. `sdd-init` must already exist or be run after preflight, per the orchestrator init guard.
3. Resolve the active change using the status contract. If `$ARGUMENTS` is missing or ambiguous, ask the user to choose and STOP. Do not guess.
4. Produce structured status from Engram before acting.
5. The active change must have tasks and implementation evidence. Missing specs/design may be handled gracefully by the verify skill, but missing tasks means there is nothing to verify.
6. actionContext must be safe for verification. If status reports `workspace-planning`, STOP and explain that full workspace implementation verification is not supported in this slice.

DEPENDENCY CHECK:

- If tasks are missing, do NOT verify.
- Tell the user what is missing and suggest `/sdd-continue <change>` or `/sdd-apply <change>` as appropriate.

TASK:
If all gates pass, launch `sdd-executor` with phase `verify`, exact installed skill path `~/.config/opencode/skills/sdd-verify/SKILL.md`, the structured status, references to available artifacts, resolved review budget, and strict TDD instructions if `sdd-init` detected strict TDD.

Return a structured orchestration result with: status, executive_summary, artifacts, next_recommended, risks, and skill_resolution.
