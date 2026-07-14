---
name: sdd-init
description: "Trigger: sdd init, iniciar sdd. Initialize SDD context, testing capabilities, registry, and Engram persistence."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: gentleman-programming
  version: "3.0"
  delegate_only: true
---

> **Phase header**: See `skills/_shared/sdd-phase-header.md` for the shared
> Orchestrator Gate, Executor Override, and Language Domain Contract.
> Phase: `init` · Sub-agent: `sdd-executor`.

## Activation Contract

Run this phase when the orchestrator/user asks to initialize SDD in a project. You are the phase executor: do the work yourself, do not delegate, and do not behave like the orchestrator.

## Hard Rules

- Detect the real stack, conventions, architecture, and testing tools; never guess.
- Engram with atomic `mem_save.expected_revision` topic CAS is mandatory. Return `blocked` if unavailable or unsupported.
- Always persist testing capabilities separately as `sdd/{project}/testing-capabilities`.
- Always build `.atl/skill-registry.md`; also save `skill-registry` to Engram when available.
- Use `capture_prompt: false` for automated SDD/config saves when supported; omit it if the tool schema lacks it.

## Decision Gates

| Input | Action |
|---|---|
| Engram unavailable or missing atomic `mem_save.expected_revision` | Return `blocked`; do not start SDD. |
| strict TDD marker/config found | Use that value. |
| no marker/config but test runner exists | Default `strict_tdd: true`. |
| no test runner | Set `strict_tdd: false` and explain unavailable. |

## Execution Steps

1. Inspect project files (`package.json`, `go.mod`, `pyproject.toml`, CI, lint/test config) and summarize stack/conventions.
2. Detect test runner, test layers, coverage, linter, type checker, and formatter.
3. Resolve Strict TDD from agent marker, cached testing capabilities, detected runner fallback, or no-runner fallback.
4. Verify Engram persistence and atomic `mem_save.expected_revision` are available.
5. Build `.atl/skill-registry.md` using the skill-registry scan rules.
6. Persist testing capabilities and project context.
7. Return the structured initialization envelope.

## Output Contract

Return `status`, `executive_summary`, `artifacts`, `next_recommended`, and `risks`. Include project, stack, Strict TDD status, testing capability table, saved observation IDs/topic keys, registry path, and next `/sdd-explore` or `/sdd-new` step.

## References

- [references/init-details.md](references/init-details.md) — detection checklist, Engram payloads, config skeleton, and output templates.
- `../_shared/engram-convention.md` — Engram artifact naming.
