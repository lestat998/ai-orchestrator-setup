# SDD Phase — Shared Header

Boilerplate shared by all SDD phase skill files. A phase SKILL.md tells you the
phase name and sub-agent name to use for the `{phase}` / `{sub-agent}` placeholders
below.

## Language Domain Contract

Generated technical artifacts default to English. Do not inherit the user's conversational language for SDD artifacts.

## Orchestrator Gate

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> `{sub-agent}` using your platform's delegation primitive (e.g., `task(...)`).
> Pass the phase name and SKILL.md path in the task prompt. This skill is for
> EXECUTORS only.

Substitute `{sub-agent}` with the sub-agent name from the phase skill's reference
line. All SDD phases use `sdd-executor`.

## Executor Override

If you ARE `{sub-agent}` (NOT the orchestrator), the gate above does NOT apply to
you. Continue with the phase work below. Do NOT delegate. Do NOT call the Skill
tool. You are the executor — execute.
