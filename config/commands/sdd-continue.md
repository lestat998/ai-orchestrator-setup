---
description: Continue the next SDD phase in the dependency chain
---

Follow the SDD orchestrator workflow to continue the active change.

HARD GATE:
SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.

WORKFLOW:

1. Resolve status from Engram with `mem_search` and `mem_get_observation` using `~/.config/opencode/skills/_shared/sdd-status-contract.md`. Do not invoke a native dispatcher that cannot read Engram. If `$ARGUMENTS` is missing and more than one active change exists, ask the user to choose and STOP.
2. Produce structured status before acting: schemaName, planningHome/changeRoot, artifactTopics/contextTopics, task progress, dependency states, next recommended action, blocked reasons, and actionContext.
3. Check which artifacts already exist for the active change (proposal, specs, design, tasks)
4. Determine the next phase needed based on the dependency graph:
   proposal → [specs ∥ design] → tasks → apply → verify → archive
5. Route every bounded `nextRecommended` token exactly as listed below. Launch only the allowed generic `sdd-executor` for execution-phase rows, passing the exact phase and installed phase skill path. Never infer from free text and never construct a skill path for a control/terminal token. `spec-and-design` explicitly fans out to both listed executors in parallel where supported (otherwise run both in a routable sequence), and `tasks` is blocked until both succeed. In interactive mode this fan-out is one planning stage: preserve the approval gate before starting it and stop after its joined result/state update.

   | `nextRecommended` | Phase(s) and exact installed SKILL.md path(s) |
   |---|---|
   | `propose` | `propose` — `~/.config/opencode/skills/sdd-propose/SKILL.md` |
   | `spec-and-design` | fan out: `spec` — `~/.config/opencode/skills/sdd-spec/SKILL.md`; `design` — `~/.config/opencode/skills/sdd-design/SKILL.md` |
   | `spec` | `spec` — `~/.config/opencode/skills/sdd-spec/SKILL.md` |
   | `design` | `design` — `~/.config/opencode/skills/sdd-design/SKILL.md` |
   | `tasks` | `tasks` — `~/.config/opencode/skills/sdd-tasks/SKILL.md` |
   | `apply` | `apply` — `~/.config/opencode/skills/sdd-apply/SKILL.md` |
   | `verify` | `verify` — `~/.config/opencode/skills/sdd-verify/SKILL.md` |
   | `archive` | `archive` — `~/.config/opencode/skills/sdd-archive/SKILL.md` |
   | `sdd-new` | Report that no SDD change is active, suggest `/sdd-new <change>`, and STOP. |
   | `select-change` | Ask the user to choose an active change and STOP. |
   | `resolve-blockers` | Report `blockedReasons` and STOP. |
   | `none` | Report terminal completion and STOP. |

   If `blockedReasons` is non-empty, do not proceed to apply, archive, or terminal work. If `nextRecommended` is `verify`, verification/remediation may run only to refresh evidence; if it is `resolve-blockers`, report `blockedReasons` and stop.
6. After every successful non-archive phase transition, create or upsert `sdd/$ARGUMENTS/state` as `active` with complete DAG progress and all known artifact observation IDs. If `spec` was routed because `rebase_required: true`, clear that flag only after the replacement spec persists, preserve the aborted/conflicted generation history, retain its generation number so the next archive attempt increments it, and preserve `reopened: false` so the consumed reservation cannot be restored. For `spec-and-design`, wait for BOTH executions, persist one joined state update containing both results, then present the result. If either branch fails, do not mark the joined stage successful. Archive owns its terminal `state: archived` write; after archive returns success, do not write active state or mutate any archived artifact.
7. Present the result and ask the user to proceed

CONTEXT:

- Working directory: delegate repository-root detection to the allowed generic executor; have it run `git rev-parse --show-toplevel 2>/dev/null || pwd` and use the returned path as the authoritative workspace. The primary orchestrator must not run Bash. In OpenCode Desktop (Electron) the parse-time interpolation resolves to the app data directory, not the project.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram search/save and phase launch. Keep the detected workspace path separate as `actionContext.workspaceRoot`; do not derive Engram project identity from that path.
- Change name: $ARGUMENTS
- Execution mode: ask/cache per orchestrator
- Persistence: Engram (mandatory)
- Delivery strategy: ask/cache per orchestrator
- Review budget: ask/cache per orchestrator

ENGRAM NOTE:
Search `sdd/$ARGUMENTS/` in Engram to list artifacts for this change. Sub-agents persist their output under deterministic topic keys.

Read the orchestrator instructions to coordinate this workflow. Do NOT execute phase work inline — delegate to sub-agents.

STATUS CONTRACT:

Read the installed shared status contract from this agent's configured skills directory. Carry `actionContext` and allowed edit roots into every sub-agent launch. If status reports `workspace-planning` with no allowed edit roots, do not launch apply/verify/archive work.
