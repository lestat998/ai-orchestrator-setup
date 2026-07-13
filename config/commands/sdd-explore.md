---
description: Explore and investigate an idea or feature — reads codebase and compares approaches
agent: ai-orchestrator-gpt
subtask: true
---

You are the `ai-orchestrator-gpt`, not an SDD executor. Launch `sdd-executor-gpt` with phase `explore` and the installed `sdd-explore/SKILL.md` only after all gates pass.

CONTEXT:

- Working directory: before doing anything else, run `git rev-parse --show-toplevel 2>/dev/null || pwd` with your bash tool and use the returned path as the authoritative workspace. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: before any memory operation, call `mem_current_project` and use its returned `project` identity for every Engram operation and executor launch. Never use the workspace basename as the Engram project; keep the workspace path separate for `actionContext`.
- Topic to explore: $ARGUMENTS

HARD GATES:

1. SDD Session Preflight must include execution mode, chained PR strategy, and review budget. If missing, ask the orchestrator preflight prompt and STOP.
2. `sdd-init` must already exist or be run after preflight, per the orchestrator init guard.
3. Confirm Engram is available and persist named exploration under `sdd/{change-name}/explore`.

TASK:
Launch the executor to investigate "$ARGUMENTS". This is exploration only: no file edits and no implementation.

Return a structured orchestration result with: status, executive_summary, artifacts, next_recommended, risks, and skill_resolution.
