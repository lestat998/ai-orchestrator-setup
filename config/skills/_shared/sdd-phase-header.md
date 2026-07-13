# SDD Phase — Shared Header

Boilerplate shared by all SDD phase skill files. A phase SKILL.md tells you the
phase name and sub-agent name to use for the `{phase}` / `{sub-agent}` placeholders
below.

## Language Domain Contract

Generated technical artifacts default to English. Do not inherit the user's conversational language for SDD artifacts.

## Project Identity Contract

Before any memory operation, every phase MUST call `mem_current_project` and use the returned `project` identity for all Engram searches, reads, saves, updates, and launch/result context. Never derive the Engram project from a workspace basename. The repository path is a separate value used only for code access and `actionContext.workspaceRoot`. If the orchestrator supplied a different project string, replace it with Engram's returned identity.

## Orchestrator Gate

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> `{sub-agent}` using your platform's delegation primitive (e.g., `task(...)`).
> Pass the phase name and SKILL.md path in the task prompt. This skill is for
> EXECUTORS only.

Substitute `{sub-agent}` with the sub-agent name from the phase skill's reference
line. After consolidation, all SDD phases use `sdd-executor`.

## Executor Override

If you ARE `{sub-agent}` (NOT the orchestrator), the gate above does NOT apply to
you. Continue with the phase work below. Do NOT delegate. Do NOT call the Skill
tool. You are the executor — execute.
