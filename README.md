# ai-orchestrator-setup

An opinionated public [OpenCode](https://opencode.ai) configuration with persistent memory, codebase intelligence, browser automation, and a structured skill system.

## Included

- **Three provider stacks:** `ai-orchestrator` uses Claude models, `ai-orchestrator-gpt` uses OpenAI models, and `ai-orchestrator-go` uses OpenCode Go models. Each stack has matching read-only review, surgical-fix, and SDD subagents.
- **Engram:** persistent project memory, session tracking, prompt capture, save nudges, and native-compaction recovery.
- **CodeGraph:** structural codebase queries for call flow, dependencies, and impact analysis.
- **Context7:** current library and framework documentation.
- **Playwright:** browser automation enabled by default.
- **SDD skills and commands:** planning, implementation, verification, archive, review, PR, and documentation workflows.

Personal memory, credentials, private repository synchronization, and personal MCP integrations are not included.

## Prerequisites

- macOS with [Homebrew](https://brew.sh)
- Node.js
- Access to at least one configured model provider

## Install

```bash
git clone https://github.com/lestat998/ai-orchestrator-setup.git ~/ai-orchestrator-setup
~/ai-orchestrator-setup/bin/bootstrap
```

Bootstrap performs these steps in order:

1. Builds a complete staged candidate, merging managed `AGENTS.md` protocol regions while preserving user-owned persona, language override, and freeform content.
2. Validates the staged native-compaction, Engram plugin, agent prompts, JSON, and portable paths before installation or deployment side effects.
3. Installs or updates the checksum-verified Engram `v1.20.0-cas.4` release unless the installed binary is exactly that version and satisfies the required atomic topic CAS capability contract.
4. Installs CodeGraph when missing.
5. Upgrades OpenCode only when the installed binary is managed by the Homebrew `opencode` formula. Other installations are left untouched with a warning; a missing installation also produces a warning.
6. Creates a collision-safe backup of the current OpenCode config and deploys only the validated staged candidate, writing `config/plugin-dependencies.json` (pins `@opencode/plugin` for OpenCode 2.x) to the live `package.json`, preserving `node_modules` and lock files, and deleting stale managed files such as DCP configuration.
7. Verifies the copied configuration and restores the backup, or removes a partial fresh installation, if the deployment copy or post-copy validation fails.

The Engram database under `~/.engram` is never deleted. Bootstrap does not import repository memory.

Restart OpenCode after every bootstrap run. Configuration, prompts, agent definitions, plugins, and the Engram binary are loaded at startup and are not hot-reloaded.

## Provider Stacks

| Primary agent | Provider | Supported subagents |
| --- | --- | --- |
| `ai-orchestrator` | Anthropic through `opencode-with-claude` | `readonly-reviewer`, `fix-executor`, `sdd-executor` |
| `ai-orchestrator-gpt` | OpenAI OAuth | `readonly-reviewer-gpt`, `fix-executor-gpt`, `sdd-executor-gpt` |
| `ai-orchestrator-go` | OpenCode Go (`opencode-go`) | `readonly-reviewer-go`, `fix-executor-go`, `sdd-executor-go` |

Implementation and confirmed fixes route to the active stack's `fix-executor`, and SDD work to its `sdd-executor`. Read-only exploration, repository mapping, impact analysis, and requirements research route to the active stack's read-only reviewer.

Launch a stack directly:

```bash
opencode --agent ai-orchestrator
opencode --agent ai-orchestrator-gpt
opencode --agent ai-orchestrator-go
```

The Claude stack uses `anthropic/claude-opus-5-5` (primary, reviewer) and `anthropic/claude-sonnet-5-5` (executors). The GPT stack defaults to `openai/gpt-6.1-sol`. The Go stack uses `opencode-go/glm-5.3` (primary), `opencode-go/kimi-k2.7-code` (reviewer, SDD executor), and `opencode-go/minimax-m3` (fix executor). Use `opencode models openai` to inspect models available to your account before changing agent model values.

## Native Compaction

This setup uses native OpenCode compaction only:

```json
"compaction": {
  "auto": true,
  "prune": false
}
```

Automatic compaction is enabled while tool output pruning is disabled. The managed Engram plugin receives `experimental.session.compacting`, injects relevant persistent project context into the compaction prompt, and instructs the resumed agent to save the compacted summary before calling `mem_context` and continuing.

Use `/compact` or `/summarize` in OpenCode when you want an immediate checkpoint.

## Updating

```bash
cd ~/ai-orchestrator-setup
git pull
bin/bootstrap
```

Every run builds and validates the complete merged candidate first, updates supported tools under the policy above, backs up the current config, and safely redeploys. Re-running bootstrap is idempotent apart from creating a new backup when an active config already exists.

## Customize Persona

Edit `~/.config/opencode/AGENTS.md`. Bootstrap preserves user-owned text and replaces only marked infrastructure regions. The PR assignment gate is repository-managed and is added safely to older custom persona files when absent.

## Structure

```text
ai-orchestrator-setup/
├── bin/
│   ├── bootstrap                  # validated staged deployment
│   ├── install-engram             # pinned checksum-verified installer
│   └── lib/
│       ├── verify-agent-prompts.mjs
│       └── verify-engram-plugin.mjs
├── config/
│   ├── AGENTS.md                  # concise persona and managed protocols
│   ├── cli.json
│   ├── plugin-dependencies.json   # pins @opencode/plugin for OpenCode 2.x
│   ├── opencode.json              # three stacks, native compaction, public MCPs
│   ├── prompts/                   # Claude, GPT, and Go orchestrator prompts
│   ├── commands/                  # slash commands
│   ├── plugins/                   # Engram, skill-registry, and rule-recall-guard adapters
│   └── skills/                    # SDD and collaboration skills
├── test/test_bootstrap.py
└── README.md
```
