#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// OpenCode v2 replaced `experimental.session.compacting` with the session
// `compaction` hook.
function compactionGuidance(source) {
  const hookStart = source.search(/await\s+ctx\.session\.hook\(\s*["']compaction["']/);
  return hookStart === -1 ? "" : source.slice(hookStart);
}

// OpenCode v2 replaced `chat.message` with the session `prompt` hook.
function promptHook(source) {
  const hookStart = source.search(/await\s+ctx\.session\.hook\(\s*["']prompt["']/);
  if (hookStart === -1) return "";
  const afterStart = source.slice(hookStart);
  const hookLength = afterStart.search(/await\s+ctx\.\w+\.hook\(\s*["'](?!prompt)/);
  return hookLength === -1 ? afterStart : afterStart.slice(0, hookLength);
}

function sessionCreatedHandler(source) {
  const handlerStart = source.search(/event\.type\s*===\s*["']session\.created["']/);
  if (handlerStart === -1) return "";

  const afterStart = source.slice(handlerStart);
  const handlerLength = afterStart.search(/event\.type\s*===\s*["']session\.deleted["']/);
  const handlerEnd = handlerLength === -1 ? undefined : handlerStart + handlerLength;
  return source.slice(handlerStart, handlerEnd);
}

const invariants = [
  {
    name: "v2-default-plugin-definition",
    present: (source) =>
      /export\s+default\s+EngramPlugin\b/.test(source) &&
      /id:\s*["']engram["']/.test(source) &&
      /async\s+setup\(\s*ctx\s*\)/.test(source),
  },
  {
    name: "no-v1-plugin-factory-export",
    present: (source) =>
      !/export\s+(const|let|var|function|async\s+function)\s/.test(source) &&
      !/@opencode-ai\/plugin/.test(source),
  },
  {
    name: "session-created-reads-event-data",
    present: (source) =>
      /const\s+data(\s*:\s*any)?\s*=\s*event\.data\b[\s\S]{0,80}?data\?\.sessionID/.test(
        sessionCreatedHandler(source),
      ),
  },
  {
    name: "subagents-classified-by-parent-or-title",
    present: (source) =>
      /!!\s*parentID\s*\|\|\s*title\.endsWith\(\s*["'] subagent\)["']\s*\)/.test(source),
  },
  {
    name: "subagents-registered-for-suppression",
    present: (source) => /subAgentSessions\.add\(\s*sessionId\s*\)/.test(source),
  },
  {
    name: "subagent-session-capture-suppressed",
    present: (source) => /subAgentSessions\.has\(\s*sessionId\s*\)\s*\)\s*return/.test(source),
  },
  {
    name: "subagent-prompt-capture-suppressed",
    present: (source) =>
      /subAgentSessions\.has\(\s*event\.sessionID\s*\)\s*\)\s*return/.test(promptHook(source)),
  },
  {
    name: "agents-owns-durable-memory-policy",
    present: (source) => /AGENTS\.md\s+owns\s+the\s+durable\s+memory\s+policy/i.test(source),
  },
  {
    name: "memory-instructions-not-embedded",
    present: (source) => !/MEMORY_INSTRUCTIONS/.test(source),
  },
  {
    name: "private-memory-import-absent",
    present: (source) => !/\.engram\/manifest\.json|sync["']\s*,\s*["']--import/.test(source),
  },
  {
    name: "native-compaction-summarizes-before-context",
    present: (source) => {
      const guidance = compactionGuidance(source);
      const summaryIndex = guidance.indexOf("mem_session_summary");
      const contextIndex = guidance.indexOf("mem_context");
      return (
        guidance.includes("FIRST ACTION REQUIRED") &&
        summaryIndex !== -1 &&
        contextIndex !== -1 &&
        summaryIndex < contextIndex
      );
    },
  },
  {
    name: "compaction-hook-does-not-claim-checkpoint-persistence",
    present: (source) => {
      const guidance = compactionGuidance(source);
      return guidance.includes("hook does not persist a checkpoint") &&
        !guidance.includes("Auto-save a session checkpoint");
    },
  },
  {
    name: "native-compaction-recovers-session-checkpoint",
    present: (source) => {
      const guidance = compactionGuidance(source);
      return guidance.includes("orchestrator/session-checkpoint/") &&
        guidance.includes("mem_get_observation") &&
        guidance.includes("Re-observe any state required by its exact next action");
    },
  },
];

export const invariantNames = invariants.map(({ name }) => name);

export function verifyEngramPlugin(source) {
  return invariants.filter(({ present }) => !present(source)).map(({ name }) => name);
}

function main() {
  const pluginPath = process.argv[2];
  if (!pluginPath) {
    console.error("usage: verify-engram-plugin <plugin-path>");
    process.exitCode = 2;
    return;
  }

  try {
    const missing = verifyEngramPlugin(readFileSync(pluginPath, "utf8"));
    if (missing.length > 0) {
      console.error("Engram plugin verification failed; missing behavior invariants:");
      for (const name of missing) console.error(`- ${name}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Engram plugin verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
