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

## Prerequisites

- macOS with [Homebrew](https://brew.sh) (Linux support possible with manual
  install of engram and codegraph)
- [Node.js](https://nodejs.org) (for codegraph)
- An AI model provider account (Anthropic, OpenAI, etc.)

## Install

```bash
git clone https://github.com/lestat998/ai-orchestrator-setup.git ~/ai-orchestrator-setup
~/ai-orchestrator-setup/bin/bootstrap
```

Then open `opencode` and log into your model provider once — credentials are
stored outside the config folder and are never part of this repo.

## Customize your persona

Edit `~/.config/opencode/AGENTS.md`. The file has two sections:

1. **Persona** (top) — your personality, tone, and rules. Edit freely or delete
   for a neutral assistant.
2. **Protocols** (below) — Engram memory, CodeGraph, skill loading. These are
   the orchestrator infrastructure — edit only if you know what you're doing.

## What's NOT included

- **No AI model credentials** — you bring your own provider key.
- **No personal memory** — engram starts with an empty database. Your
  observations build up over time as you work.
- **No external CLI dependency** — this setup is fully standalone. The skills
  and protocols work natively with OpenCode.

## Structure

```
ai-orchestrator-setup/
├── bin/bootstrap          # one-time setup script
├── config/
│   ├── AGENTS.md          # persona (customizable) + protocols (infrastructure)
│   ├── opencode.jsonc     # MCP server config (engram + codegraph)
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

This backs up your current config before overwriting. Your engram memory
database is unaffected — it lives in engram's own data directory, not in
the opencode config.
