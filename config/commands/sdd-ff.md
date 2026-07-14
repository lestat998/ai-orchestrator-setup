---
description: Fast-forward all SDD planning phases — proposal through tasks
agent: ai-orchestrator-gpt
---

Follow the SDD orchestrator workflow to fast-forward all planning phases for change "$ARGUMENTS".

HARD GATE:
SDD Session Preflight must include execution mode, chained PR strategy, and review budget. If missing, ask the orchestrator preflight prompt and STOP. Confirm Engram is available; do not offer another backend.

WORKFLOW:
Honor the cached execution mode from SDD Session Preflight.

Planning phases:

1. sdd-propose — create the proposal
2. sdd-spec and sdd-design — write specifications and technical design; they may run in parallel
3. sdd-tasks — run only after BOTH spec and design complete

- In `interactive` mode: run only the next planning phase, present its summary and artifact path(s), ask whether to adjust or continue, then STOP. Do not launch the following phase until the user confirms.
- In `auto` mode: run proposal, then spec and design in parallel when supported, wait for BOTH, then run tasks and present a combined summary.
- Before the first launch, create/update `sdd/$ARGUMENTS/state` with `state: active` and initialized DAG progress. After every successful phase, update that same active state with the completed phase and artifact observation ID. Treat spec plus design as one parallel DAG layer: update its completed progress only after BOTH executors return success; if either is partial or blocked, preserve any completed artifact progress, do not run tasks, and stop.

CONTEXT:

- Working directory: delegate repository-root detection to the allowed generic executor; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd` and use the returned path as the authoritative workspace. The primary orchestrator must not run Bash. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: before any memory operation, call `mem_current_project` and use its returned `project` identity for every Engram operation and executor launch. Never use the workspace basename as the Engram project; keep the workspace path separate for `actionContext`.
- Change name: $ARGUMENTS
- Execution mode: ask/cache per orchestrator
- Delivery strategy: ask/cache per orchestrator
- Review budget: ask/cache per orchestrator

ENGRAM NOTE:
Launch the allowed generic `sdd-executor` for each phase with its exact installed path: `skills/sdd-propose/SKILL.md`, `skills/sdd-spec/SKILL.md`, `skills/sdd-design/SKILL.md`, and `skills/sdd-tasks/SKILL.md`. Executors persist `sdd/$ARGUMENTS/{type}` where type is proposal, spec, design, or tasks; the orchestrator persists active DAG state after each successful transition.

Read the orchestrator instructions to coordinate this workflow. Do NOT execute phase work inline — delegate to sub-agents.
