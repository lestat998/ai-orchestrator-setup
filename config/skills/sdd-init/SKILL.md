---
name: sdd-init
description: "Trigger: sdd init, initialize SDD. Detect project context, testing capabilities, registry, and Engram persistence."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: gentleman-programming
  version: "4.0"
  delegate_only: true
---

> **Phase header**: See `skills/_shared/sdd-phase-header.md` for the shared
> Orchestrator Gate, Executor Override, and Language Domain Contract.
> Phase: `init` · Sub-agent: `sdd-executor`.

## Activation Contract

Initialize SDD for the current project. Engram is mandatory; if its tools are unavailable or `mem_save` does not expose atomic `expected_revision` CAS with `id`, `sync_id`, and `revision_count` results, stop and report the blocker.

## Hard Rules

- Detect the real stack, architecture, conventions, and testing tools; never guess.
- Persist project context as `sdd-init/{project}`.
- Persist testing capabilities separately as `sdd/{project}/testing-capabilities`.
- Build `.atl/skill-registry.md` and save `skill-registry` to Engram.
- Use `capture_prompt: false` for automated saves when supported.
- Do not create repository-local SDD planning artifacts.
- Require the installed Engram `mem_save` schema to expose `expected_revision`; do not silently downgrade to unguarded spec-manifest writes.

## Strict TDD Resolution

| Evidence | Result |
|---|---|
| Agent/project marker explicitly sets Strict TDD | Use that value. |
| No marker and a test runner exists | Default `strict_tdd: true`. |
| No test runner | Set `strict_tdd: false` and explain why. |

## Execution Steps

1. Confirm Engram availability and that `mem_save` exposes `expected_revision` plus `id`, `sync_id`, and `revision_count` results; stop if not.
2. Inspect project manifests, CI, lint, format, type-check, and test configuration.
3. Detect test runner, test layers, coverage, and quality commands.
4. Resolve Strict TDD using the table above.
5. Build `.atl/skill-registry.md` using the registry scan rules.
6. Save project context, testing capabilities, and registry to their deterministic topic keys.
7. Return the shared response envelope with observation IDs.

## Output Contract

Return `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, and `skill_resolution`. Include project, stack, Strict TDD status, testing capability table, saved topic keys and observation IDs, registry path, and the next `/sdd-explore` or `/sdd-new` step.

## References

- [references/init-details.md](references/init-details.md)
- `../_shared/engram-convention.md`
- `../_shared/sdd-phase-common.md`
