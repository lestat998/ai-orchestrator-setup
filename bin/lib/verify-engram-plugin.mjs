#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function compactionGuidance(source) {
  const hookStart = source.search(/["']experimental\.session\.compacting["']\s*:/);
  return hookStart === -1 ? "" : source.slice(hookStart);
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
    name: "session-created-reads-properties-info",
    present: (source) =>
      /const\s+info\s*=\s*\(?event\.properties[\s\S]{0,40}?\.info/.test(sessionCreatedHandler(source)),
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
    present: (source) => /subAgentSessions\.has\(\s*input\.sessionID\s*\)\s*\)\s*return/.test(source),
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
    name: "native-compaction-injects-engram-context",
    present: (source) => {
      const guidance = compactionGuidance(source);
      return /\/context\?project=/.test(guidance) && /output\.context\.push\(data\.context\)/.test(guidance);
    },
  },
  {
    name: "native-compaction-summarizes-before-context",
    present: (source) => {
      const guidance = compactionGuidance(source);
      const summaryIndex = guidance.indexOf("mem_session_summary");
      const contextIndex = guidance.indexOf("mem_context");
      return guidance.includes("FIRST ACTION REQUIRED") && summaryIndex !== -1 && contextIndex > summaryIndex;
    },
  },
  {
    name: "native-compaction-uses-supported-summary-contract",
    present: (source) => {
      const guidance = compactionGuidance(source);
      const summaryStart = guidance.indexOf("Call mem_session_summary");
      const summaryEnd = guidance.indexOf("Then IMMEDIATELY call mem_context");
      const summaryInstruction = summaryStart === -1 || summaryEnd === -1 ? "" : guidance.slice(summaryStart, summaryEnd);
      return summaryInstruction.includes("content") && summaryInstruction.includes("session_id") && !summaryInstruction.includes("project:");
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
