---
description: Initialize SDD context, testing capabilities, and Engram persistence
subtask: true
---

You are the currently selected primary orchestrator, not an SDD executor. This command may launch only the allowed generic `sdd-executor`, with phase `init` and exact installed skill path `~/.config/opencode/skills/sdd-init/SKILL.md`, after the SDD Session Preflight gate passes.

CONTEXT:

- Working directory and Git baseline: delegate observation to the allowed executor for this command. It must run separate Git commands for repository root, branch, HEAD, and porcelain status and return each command/result as verified evidence. If any command fails, record that field as `unknown`; never substitute `pwd` or another fallback. Do not make Git claims, advance a plan, or perform a mutation that depends on an unknown field. Re-observe all four fields immediately before and after every mutation.
- Current project: call `mem_current_project` and use the exact returned `project` value for every Engram operation and phase launch. Keep the workspace path separate as `actionContext.workspaceRoot`; do not derive project identity from that path.

HARD GATES:

1. SDD Session Preflight must already be complete for this session. It must include execution mode, Engram availability, chained PR strategy, and review budget. If missing, ask the exact orchestrator preflight prompt and STOP.
2. Engram must be available with atomic `mem_save.expected_revision` support; otherwise return `blocked`.

TASK:
If all gates pass, launch `sdd-executor` with phase `init` and exact installed skill path `~/.config/opencode/skills/sdd-init/SKILL.md` to detect project stack, conventions, architecture patterns, testing capability, and strict TDD support. Persist context as `sdd-init/{project}` and capabilities as `sdd/{project}/testing-capabilities`.

Return a structured orchestration result with: status, verified_evidence, executive_summary, artifacts_or_files, remaining_work, next_recommended, risks, and skill_resolution.
