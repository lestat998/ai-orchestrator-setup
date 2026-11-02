---
description: Start a new SDD change — runs exploration then creates a proposal
---

Follow the SDD orchestrator workflow for starting a new change named "$ARGUMENTS".

HARD GATE:
SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.

WORKFLOW:

Honor the cached execution mode. In `auto` mode continue through accepted phases without asking or pausing. In `interactive` mode ask exactly once after the current accepted phase whether to continue, then STOP until the user responds.

1. Launch the allowed generic `sdd-executor` with phase `explore` and exact installed skill path `~/.config/opencode/skills/sdd-explore/SKILL.md` to investigate the codebase for this change
2. Validate the exploration envelope and accept it only after its artifact/state and durable session checkpoint are persisted. In `interactive` mode present the summary, ask once whether to continue, and STOP; in `auto` mode continue immediately.
3. Launch the allowed generic `sdd-executor` with phase `propose` and exact installed skill path `~/.config/opencode/skills/sdd-propose/SKILL.md` to create a proposal based on the exploration
4. Validate the proposal envelope and accept it only after its artifact/state and durable session checkpoint are persisted. In `interactive` mode present the summary, ask once whether to continue with specs and design, and STOP; in `auto` mode report the proposal and continue without a user pause.

CONTEXT:

- Working directory and Git baseline: delegate observation to the allowed executor for this command. It must run separate Git commands for repository root, branch, HEAD, and porcelain status and return each command/result as verified evidence. If any command fails, record that field as `unknown`; never substitute `pwd` or another fallback. Do not make Git claims, advance a plan, or perform a mutation that depends on an unknown field. Re-observe all four fields immediately before and after every mutation.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram operation and phase launch. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.
- Change name: $ARGUMENTS
- Execution mode: ask/cache per orchestrator
- Persistence: Engram (mandatory)
- Delivery strategy: ask/cache per orchestrator
- Review budget: ask/cache per orchestrator

ENGRAM NOTE:
Sub-agents persist each phase with topic key `sdd/$ARGUMENTS/{type}`.

Read the orchestrator instructions to coordinate this workflow. Do NOT execute phase work inline — delegate to sub-agents.
