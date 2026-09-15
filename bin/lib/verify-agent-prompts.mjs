#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const promptPaths = ["prompts/orchestrator.md", "prompts/orchestrator-gpt.md"];

function required(source, text, name, failures) {
  if (!source.includes(text)) failures.push(name);
}

function ordered(source, first, second, name, failures) {
  if (source.indexOf(first) === -1 || source.indexOf(second) === -1 || source.indexOf(first) >= source.indexOf(second)) {
    failures.push(name);
  }
}

function shippedJsonPaths(root) {
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") paths.push(...shippedJsonPaths(path));
    if (entry.isFile() && /\.jsonc?$/.test(entry.name)) paths.push(path);
  }
  return paths;
}

export function verifyAgentPrompts(configRoot) {
  const failures = [];
  const config = JSON.parse(readFileSync(resolve(configRoot, "opencode.json"), "utf8"));
  const primary = Object.entries(config.agent ?? {}).filter(([, agent]) => agent.mode === "primary");
  const expected = new Map([
    ["ai-orchestrator", "{file:./prompts/orchestrator.md}"],
    ["ai-orchestrator-gpt", "{file:./prompts/orchestrator-gpt.md}"],
  ]);
  const expectedAgents = new Set([
    "ai-orchestrator",
    "readonly-reviewer",
    "fix-executor",
    "sdd-executor",
    "ai-orchestrator-gpt",
    "readonly-reviewer-gpt",
    "fix-executor-gpt",
    "sdd-executor-gpt",
  ]);

  if (primary.length !== expected.size) failures.push("primary-agent-count");
  for (const [name, prompt] of expected) {
    if (config.agent?.[name]?.prompt !== prompt) failures.push(`primary-agent-prompt:${name}`);
  }
  if (Object.keys(config.agent ?? {}).some((name) => !expectedAgents.has(name))) failures.push("unsupported-agent-topology");
  if (config.provider?.["runpod-local-model"]) failures.push("private-provider-present");
  if (config.plugin?.some((plugin) => String(plugin).toLowerCase().includes("dcp"))) failures.push("dcp-plugin-present");
  if (config.compaction?.auto !== true || config.compaction?.prune !== false) failures.push("native-compaction-config");

  const expectedMcps = new Set(["context7", "engram", "codegraph", "playwright"]);
  const configuredMcps = Object.keys(config.mcp ?? {});
  if (configuredMcps.length !== expectedMcps.size || configuredMcps.some((name) => !expectedMcps.has(name))) {
    failures.push("public-mcp-topology");
  }
  if (config.mcp?.playwright?.enabled !== true) failures.push("playwright-enabled");

  for (const path of shippedJsonPaths(configRoot)) {
    const source = readFileSync(path, "utf8");
    if (/\/(?:Users|home)\/[^/\s"']+|[A-Za-z]:\\\\Users\\\\[^\\\s"']+/.test(source)) {
      failures.push(`machine-specific-path:${path.slice(resolve(configRoot).length + 1)}`);
    }
  }

  for (const name of ["readonly-reviewer", "readonly-reviewer-gpt"]) {
    const reviewer = config.agent?.[name];
    if (!reviewer || reviewer.tools?.read !== true || reviewer.tools?.bash !== true || reviewer.tools?.edit === true || reviewer.tools?.write === true) {
      failures.push(`readonly-reviewer-tools:${name}`);
    }
  }

  for (const path of promptPaths) {
    const source = readFileSync(resolve(configRoot, path), "utf8");
    const prefix = `${path}:`;
    ordered(source, "## Request Interpretation Gate", "## Context Preflight", `${prefix}request-before-context`, failures);
    required(source, "before tools, repository inspection, or delegation", `${prefix}request-before-tools`, failures);
    required(source, "without tools or memory retrieval", `${prefix}binary-without-tools`, failures);
    required(source, "For a confirmed project task", `${prefix}memory-after-confirmed-target`, failures);
    required(source, "before inspecting any checkout", `${prefix}unknown-target-before-inspection`, failures);
    required(source, "## No-Guess Decision Gate", `${prefix}no-guess-gate`, failures);
    required(source, "read-only exploration, codebase grounding, repository mapping, impact analysis, and requirements research to `readonly-reviewer`", `${prefix}exploration-to-readonly-reviewer`, failures);
    required(source, "Never invent an unsupported task type such as `Explore Task`", `${prefix}no-invented-explore-task`, failures);
    if (/Call `mem_context` and `mem_search`[^\n]*before answering/.test(source)) failures.push(`${prefix}unconditional-memory-before-answer`);
  }

  const gptPrompt = readFileSync(resolve(configRoot, "prompts/orchestrator-gpt.md"), "utf8");
  required(gptPrompt, "`readonly-reviewer` → `readonly-reviewer-gpt`", "prompts/orchestrator-gpt.md:readonly-reviewer-gpt-remapping", failures);
  required(gptPrompt, "`general` / `general-purpose` → unchanged", "prompts/orchestrator-gpt.md:general-remapping", failures);

  const agents = readFileSync(resolve(configRoot, "AGENTS.md"), "utf8");
  ordered(agents, "## Request Interpretation and Answer Shape", "### CONTEXT PREFLIGHT", "agents:request-before-memory", failures);
  required(agents, "Do not call memory tools before answering a simple binary", "agents:binary-without-memory", failures);
  required(agents, "After request interpretation confirms a project task", "agents:memory-after-confirmed-target", failures);
  required(agents, "<!-- ai-orchestrator:pr-assignment-gate -->", "agents:managed-pr-assignment-gate", failures);
  required(agents, "gh pr create ... --assignee @me", "agents:pr-create-assignee", failures);
  if (agents.includes("Always propose alternatives")) failures.push("agents:unconditional-alternatives");
  if (agents.includes("User's FIRST message references the project, a feature, or a problem — `mem_search` before responding")) failures.push("agents:unconditional-first-message-memory");

  for (const path of ["skills/branch-pr/SKILL.md", "skills/chained-pr/references/chaining-details.md"]) {
    const source = readFileSync(resolve(configRoot, path), "utf8");
    required(source, "--assignee @me", `${path}:pr-create-assignee`, failures);
    required(source, "--json assignees", `${path}:assignee-verification`, failures);
  }

  return failures;
}

function main() {
  const configRoot = process.argv[2];
  if (!configRoot) {
    console.error("usage: verify-agent-prompts <opencode-config-directory>");
    process.exitCode = 2;
    return;
  }
  try {
    const failures = verifyAgentPrompts(configRoot);
    if (failures.length > 0) {
      console.error("Agent prompt verification failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Agent prompt verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
