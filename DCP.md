# Dynamic Context Pruning (DCP) + Engram

This setup runs two complementary context systems. They do different jobs and must not be confused for one another.

## Why both

- **Engram = long-term memory.** It persists decisions, bug fixes, discoveries, and session summaries across sessions and compactions in a durable store you explicitly write to (`mem_save`) and read from (`mem_search` / `mem_context`).
- **DCP = short-term context hygiene.** It shrinks the *in-flight* conversation sent to the model by replacing stale spans with high-fidelity technical summaries (`range` mode), de-duplicating repeated tool calls, and purging the bulky inputs of failed tool calls. Session history on disk is never modified — DCP only rewrites what is sent to the LLM.

Engram remembers across time; DCP keeps a single session lean. One never replaces the other.

## Configuration

- DCP plugin: pinned in `opencode.json` under `plugin` (`@tarquinen/opencode-dcp@3.1.14`).
- DCP settings: `dcp.jsonc`, deployed to `~/.config/opencode/dcp.jsonc`. `bin/bootstrap` copies the default **only if none exists**, so local edits are preserved. It is excluded from the destructive config sync for the same reason.

Key defaults: `range` compression, conservative limits for 272k-token models (`minContextLimit` 70000 / `maxContextLimit` 140000), turn protection (6 turns), deduplication and failed-tool input cleanup on, minimal notifications, auto-update off.

## Protected from pruning

Engram memory tools, `codegraph_explore`, `task`, and `skill` outputs are preserved through compression and never de-duplicated or purged, so recall and delegation results survive a compression pass.

## Disabling DCP

Set `"enabled": false` in `~/.config/opencode/dcp.jsonc` and restart OpenCode. To remove it entirely, delete the `@tarquinen/opencode-dcp@3.1.14` entry from the `plugin` array in `opencode.json`.

## Commands

- `/dcp` — opens the DCP panel (context stats, manual-mode controls).
- `/dcp-compress [focus]` — asks the model to run one compression pass now; optional focus text directs what to compress.

## Why DCP is disabled for subagents

`experimental.allowSubAgents` is `false`. Subagents (executor, explore, etc.) run short, bounded tasks and report a compact result; their context does not need in-flight pruning, and the `compress` tool must stay off their tool list so it is only ever driven by the primary orchestrator. This keeps subagent behavior deterministic and avoids compression nudges competing with task-scoped instructions.

## Interaction with Engram (compaction vs compression)

- **Native OpenCode compaction** still triggers `mem_session_summary` then `mem_context` — it is a full session summarization.
- **DCP range compression** does NOT trigger `mem_session_summary`. After a DCP pass, search Engram only if required context is actually missing.
