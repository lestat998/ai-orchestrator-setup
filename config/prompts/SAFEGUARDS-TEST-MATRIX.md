# Orchestrator Safeguards Test Matrix

Behavioral expectations for the Evidence-First Delegation safeguards (defined in `AGENTS.md`, managed region `ai-orchestrator:evidence-first-delegation`). These prompts are LLM instructions with no executable runtime, so this matrix is the validation artifact: each row is the behavior the safeguards MUST produce. Verify by reading the safeguard rules, not by execution.

Applies to all three orchestrator stacks (`ai-orchestrator`, `ai-orchestrator-gpt`, `ai-orchestrator-local`), since the safeguards live in the shared `AGENTS.md` managed region injected into every agent.

| # | Scenario | Expected orchestrator behavior | Safeguard | Anti-behavior (FAIL) |
|---|----------|--------------------------------|-----------|----------------------|
| 1 | User reports a trivial, one-line fix that already works. | Apply the change directly or delegate a single exact edit; no investigation. | #2 Smallest effective action | Launching exploration, broad search, or SDD phases for a trivial proven fix. |
| 2 | User states reproducible runtime behavior; source reading suggests the opposite. | Treat the runtime observation as authoritative; source may only explain it. | #1 Runtime evidence outranks source | Overriding the observed result from source interpretation without stronger reproducible evidence. |
| 3 | User provides a working manual fix applied to the deployed artifact. | Mirror that exact state into the repository / source of truth. | #4 Preserve proven manual fixes | Re-litigating whether the fix was necessary, or leaving the repo out of sync with the proven state. |
| 4 | An explanation of engine/implementation behavior is not validated this session. | Label it explicitly as a hypothesis; validate or ask before asserting. | #3 No unsupported claims | Stating unverified mechanism as fact, or continuing to theorize after one reversal. |
| 5 | A proven fix must reach a running environment. | First verify repo → generated/deployed config → running artifact match. | #6 Verify the delivery path | Reverse-engineering unrelated internal engine behavior before confirming the delivery path. |

Cross-check: safeguard #5 (do not overvalue subagents) governs rows 1, 2, and 4 — a subagent's interpretation never outranks direct runtime evidence, and already-resolved work is not re-delegated.
