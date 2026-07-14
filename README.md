# ai-orchestrator-setup

An opinionated [OpenCode](https://opencode.ai) configuration with persistent
memory, codebase intelligence, and a structured skill system.

## What you get

- **Engram** — persistent AI memory that survives across sessions and context
  compactions. The agent remembers decisions, bugs, discoveries, and conventions.
- **CodeGraph** — structural codebase queries (call flow, dependencies, impact
  analysis) in one call instead of grep/read loops.
- **22 skills** — SDD (Spec-Driven Development) workflow, PR creation, code
  review, documentation, and more.
- **12 slash commands** — `/sdd-init`, `/sdd-new`, `/sdd-verify`, etc.
- **Engram plugin** — automatic session tracking, prompt capture, compaction
  resilience, and save nudges.
- **Native GPT orchestrator stack** — one primary coordinator and three focused
  subagents, all configured for OpenAI OAuth without an authentication plugin.
- **Engram-only SDD** — planning artifacts, state, verification, and archive
  reports use deterministic `sdd/<change>/<artifact>` topic keys.

## Prerequisites

- macOS with [Homebrew](https://brew.sh) (Linux support possible with manual
  install of engram and codegraph)
- [Node.js](https://nodejs.org) (for codegraph)
- A ChatGPT Plus or Pro account for OpenAI OAuth
- An Engram release whose `engram capabilities --json` output declares schema
  version 1 and supported `features.atomic_topic_cas`, with integer
  `expected_revision` requiring `topic_key`, success fields `id`/`sync_id`/
  `revision_count`, and the documented CAS validation error codes. SDD
  initialization and onboarding must stop rather than write the canonical spec
  manifest without this contract.

## Install

```bash
git clone https://github.com/lestat998/ai-orchestrator-setup.git ~/ai-orchestrator-setup
~/ai-orchestrator-setup/bin/bootstrap
```

Bootstrap keeps an existing Engram only when it exposes that complete capability
contract. Otherwise it uninstalls the incompatible upstream Homebrew formula and
installs the checksum-verified `lestat998/engram` `v1.19.1-cas.2` release.
This replacement does not remove the existing database under `~/.engram`.

Restart OpenCode after bootstrap, then run `/connect`, select OpenAI, and choose the ChatGPT
Plus/Pro browser login. OpenCode handles this OAuth flow natively; do not install
the `codex-auth` plugin. Credentials are stored outside the config folder and
are never part of this repo.

The four bundled agents default to `openai/gpt-5.6-sol`. If that model is not
available to your account, replace the `model` value on all four agents in
`~/.config/opencode/opencode.jsonc` with an OpenAI model you can access. Run
`opencode models openai` to see the models exposed by your installation.

Launch directly with:

```bash
opencode --agent ai-orchestrator-gpt
```

You can also start `opencode` normally and use Tab to select
`ai-orchestrator-gpt` from the primary agents.

## Customize your persona

Edit `~/.config/opencode/AGENTS.md`. The file has two sections:

1. **Persona** (top) — your personality, tone, and rules. Edit freely or delete
   for a neutral assistant.
2. **Protocols** (below) — Engram memory, CodeGraph, skill loading. These are
   the orchestrator infrastructure — edit only if you know what you're doing.

## What's NOT included

- **No shared AI credentials** — authenticate with your own ChatGPT Plus or Pro account via OAuth.
- **No personal memory** — engram starts with an empty database. Your
  observations build up over time as you work.
- **No orchestration CLI dependency** — the skills and protocols work natively
  with OpenCode; bootstrap installs the required Engram and CodeGraph tools.

## Structure

```
ai-orchestrator-setup/
├── bin/bootstrap          # one-time setup script
├── config/
│   ├── AGENTS.md          # persona (customizable) + protocols (infrastructure)
│   ├── opencode.jsonc     # native OpenAI model, GPT agents, and MCP servers
│   ├── prompts/           # GPT orchestrator prompt and subagent remapping
│   ├── tui.json           # TUI plugins (subagent statusline)
│   ├── commands/          # 12 slash commands
│   ├── plugins/
│   │   └── engram.ts      # session tracking, prompt capture, save nudges
│   └── skills/            # 22 skills (SDD, PR, review, docs, etc.)
└── README.md
```

## Updating

Pull the latest and re-run bootstrap:

```bash
cd ~/ai-orchestrator-setup
git pull
bin/bootstrap
```

Bootstrap installs or replaces Engram first, then stages the configuration and
checks `engram capabilities --json` before backing up or replacing the active
OpenCode config. It fails without changing that config or its backups when the
required `atomic_topic_cas` contract is absent or incomplete. The current
upstream Homebrew formula does not provide this capability and is replaced
automatically on macOS.

This backs up your current config before overwriting. Your engram memory
database is unaffected — it lives in engram's own data directory, not in
the opencode config.

Restart OpenCode after every bootstrap run so updated commands, skills, and the
Engram plugin are loaded. In the verified OpenCode 1.17.15 installation,
`OPENCODE_EXPERIMENTAL_CODE_MODE=1` is an optional experimental token-reduction
switch; bootstrap does not enable or require it, and later versions may change it.
