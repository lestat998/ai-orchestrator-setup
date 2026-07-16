# Orchestrator Routing Test Matrix

Documented routing expectations for natural-language requests across all three orchestrator stacks. These prompts are LLM instructions (no executable runtime), so this matrix is the validation artifact: each row is the intent classification the `## SDD & Workflow Classification` rules must produce. Verify by reading the prompt rules, not by execution.

Stack → SDD executor / generic executor:
- `ai-orchestrator` → `sdd-executor-claude` / `executor-claude`
- `ai-orchestrator-gpt` → `sdd-executor-gpt` / `executor-gpt`
- `ai-orchestrator-local` → `sdd-executor-local` / `executor-local`

Sub-agent shown as `<sdd-executor>` / `<executor>` = the active stack's variant. Never cross stacks.

| # | Prompt | Detected intent | Phase / workflow | Sub-agent | Generic Build path? | Why |
|---|--------|-----------------|------------------|-----------|--------------------|-----|
| 1 | Investigate this legacy implementation and find similar code. | Investigation | `sdd-explore` | `<sdd-executor>` | No | Understanding existing/legacy code + finding prior art is the explore phase. |
| 2 | Explore the current behavior and create an implementation plan. | Investigation → planning | `sdd-explore` → `sdd-propose` → `sdd-spec` → `sdd-design` → `sdd-tasks` (only phases needed) | `<sdd-executor>` | No | "Explore + create a plan" spans investigation and planning; run the required phases in order. |
| 3 | Fix these three related TTL issues. | Multi-area behavior change, no approved artifacts | `sdd-explore` first, then planning if warranted | `<sdd-executor>` | No | A fix touching behavior across multiple areas with no SDD artifacts starts with explore, not a Build task. |
| 4 | Implement the approved SDD tasks. | Implement existing SDD change | `sdd-apply` | `<sdd-executor>` | No | Approved tasks already exist → apply phase. |
| 5 | Verify that the implementation matches the specification. | Verification | `sdd-verify` | `<sdd-executor>` | No | Checking code against the approved plan / acceptance criteria is the verify phase. |
| 6 | Rename this method and update its two callers. | Small, fully-specified mechanical edit | none (generic) | `<executor>` | Yes (acceptable) | Tiny, fully-specified mechanical change where investigation/design add no value. |

Explicit `/sdd-*` commands continue to load the exact phase skill directly, unchanged.
