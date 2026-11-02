---
description: Fast-forward all SDD planning phases — proposal through tasks
---

Follow the SDD orchestrator workflow to fast-forward all planning phases for change "$ARGUMENTS".

HARD GATE:
SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.

WORKFLOW:
Honor the cached execution mode from SDD Session Preflight.

Planning phases:

1. Launch `sdd-executor` with phase `propose` and exact installed skill path `~/.config/opencode/skills/sdd-propose/SKILL.md`.
2. After proposal succeeds, launch two `sdd-executor` tasks in parallel: phase `spec` with `~/.config/opencode/skills/sdd-spec/SKILL.md`, and phase `design` with `~/.config/opencode/skills/sdd-design/SKILL.md`.
3. Only after BOTH spec and design succeed, launch `sdd-executor` with phase `tasks` and `~/.config/opencode/skills/sdd-tasks/SKILL.md`.
4. After each successful stage, create or upsert `sdd/$ARGUMENTS/state` as `active` with the complete DAG progress and all known artifact observation IDs. Proposal is one stage; parallel spec+design is one joined stage whose state is written only after BOTH succeed; tasks is one stage. A stage is not complete until its state write succeeds.

- In `interactive` mode: run only the next planning stage (proposal, parallel spec+design, or tasks), validate its child envelope, persist its active DAG state and durable session checkpoint, present its summary and artifact topic keys, ask exactly once whether to adjust or continue, then STOP. Do not launch the following stage until the user confirms.
- In `auto` mode: validate and checkpoint each stage, run all planning phases back-to-back without asking or pausing, and present a combined summary after all phases complete.

CONTEXT:

- Working directory and Git baseline: delegate observation to the allowed executor for this command. It must run separate Git commands for repository root, branch, HEAD, and porcelain status and return each command/result as verified evidence. If any command fails, record that field as `unknown`; never substitute `pwd` or another fallback. Do not make Git claims, advance a plan, or perform a mutation that depends on an unknown field. Re-observe all four fields immediately before and after every mutation.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram operation and phase launch. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.
- Change name: $ARGUMENTS
- Execution mode: ask/cache per orchestrator
- Persistence: Engram (mandatory)
- Delivery strategy: ask/cache per orchestrator
- Review budget: ask/cache per orchestrator

ENGRAM NOTE:
Sub-agents save with topic key `sdd/$ARGUMENTS/{type}` where type is proposal, spec, design, or tasks.

Read the orchestrator instructions to coordinate this workflow. Do NOT execute phase work inline — delegate to sub-agents.
