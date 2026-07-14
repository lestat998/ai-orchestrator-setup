---
description: Implement SDD tasks — writes code following specs and design
subtask: true
---

You are the currently selected primary orchestrator, not an SDD executor. This command may launch only the allowed generic `sdd-executor`, with phase `apply` and exact installed skill path `~/.config/opencode/skills/sdd-apply/SKILL.md`, after the orchestration gates below pass.

CONTEXT:

- Working directory: delegate repository-root detection to the allowed generic executor; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd` and use the returned path as the authoritative workspace. The primary orchestrator must not run Bash. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram operation and phase launch. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.

HARD GATES:

1. SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.
2. `sdd-init` must already exist or be run after preflight, per the orchestrator init guard.
3. Resolve the active change using the status contract. If `$ARGUMENTS` is missing or ambiguous, ask the user to choose and STOP. Do not guess.
4. Produce structured status before acting and confirm Engram has proposal, spec, design, and tasks artifacts.
5. Review workload guard must have passed. If task forecast exceeds the session review budget or needs a chained-PR decision, ASK and STOP unless the preflight strategy already resolves it.
6. actionContext must allow implementation edits. If status reports `workspace-planning` with no allowed edit roots, STOP before launching apply.

DEPENDENCY CHECK:

- If proposal, spec, design, or tasks are missing, do NOT implement.
- Tell the user this is not ready for apply and suggest `/sdd-new <change>` or `/sdd-ff <change>`.

TASK:
If all gates pass, launch `sdd-executor` with phase `apply`, exact installed skill path `~/.config/opencode/skills/sdd-apply/SKILL.md`, and:

- The Engram project.
- The structured status: schemaName, planningHome/changeRoot, artifactTopics/contextTopics, task progress, applyState, dependency states, and actionContext.
- References to the spec, design, tasks, and any apply-progress artifacts.
- The resolved delivery/chained PR strategy and review budget.
- Strict TDD instructions if `sdd-init` detected strict TDD.

Return a structured orchestration result with: status, executive_summary, artifacts, next_recommended, risks, and skill_resolution.
