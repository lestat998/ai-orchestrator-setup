---
name: sdd-onboard
description: "Walk users through the Engram-backed SDD workflow on the real codebase. Trigger: orchestrator launches onboarding for the full SDD cycle."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: gentleman-programming
  version: "2.0"
  delegate_only: true
---

> **Phase header**: See `skills/_shared/sdd-phase-header.md` for the shared
> Orchestrator Gate, Executor Override, and Language Domain Contract.
> Phase: `onboard` · Sub-agent: `sdd-executor`. The primary orchestrator must
> delegate this skill and must not run it inline, including for direct onboarding requests.

## Purpose

Guide the user through a real SDD cycle on their codebase. Engram with atomic `mem_save.expected_revision` support is mandatory, and every phase persists its artifact under `sdd/{change-name}/{artifact-type}`.

## Workflow

1. **Analyze**: inspect the codebase and offer 2-3 small, low-risk, spec-worthy improvements. Let the user choose.
2. **Explore**: investigate current behavior and persist `explore`.
3. **Propose**: explain WHAT and WHY, persist `proposal`, show it, and pause for user approval.
4. **Spec + Design**: after proposal, run both planning phases in parallel; spec defines testable RFC 2119 requirements against the canonical manifest, records its ID, sync ID, and revision plus each domain's immutable parent reference, while design documents implementation approach, concrete files, decisions, and rationale.
5. **Tasks**: only after BOTH spec and design succeed, create dependency-ordered tasks and the 400-line review workload forecast; persist `tasks`.
6. **Apply**: require proposal, spec, design, and tasks; enforce action context, workload decision, and strict TDD when active; update tasks and persist cumulative `apply-progress`.
7. **Verify**: run tests and map every scenario to runtime evidence; persist `verify-report`.
8. **Archive**: persist `archiving` state, create all immutable generation evidence, publish every affected domain with one CAS of `sdd/specs/manifest` against the recorded baseline revision, create the generation report with `expected_revision: 0` and exact-winner validation on conflict, and finally mark that generation archived.

Use the individual phase skills for all formats, dependencies, guards, persistence, and response envelopes. Briefly explain why each phase exists before running it.

## Completion Summary

Report the change name, code files changed, archive generation, and Engram topic keys/observation IDs for proposal, spec, design, tasks, apply-progress, verify-report, and the generation-specific archive report. Remind the user that the dependency chain is:

`explore → propose → [spec ∥ design] → tasks → apply → verify → archive`

## Rules

- This is production work, not a demo.
- Keep narration to 1-3 sentences per phase.
- Pause after proposal in interactive mode.
- Stop on failed tests, unclear design, missing Engram, unsafe action context, or unresolved review-budget decisions.
- Return the Section D envelope from `skills/_shared/sdd-phase-common.md`.
