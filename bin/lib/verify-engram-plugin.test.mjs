import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { invariantNames, verifyEngramPlugin } from "./verify-engram-plugin.mjs";

const pluginPath = fileURLToPath(new URL("../../config/plugins/engram.ts", import.meta.url));
const verifierPath = fileURLToPath(new URL("./verify-engram-plugin.mjs", import.meta.url));
const pluginSource = readFileSync(pluginPath, "utf8");

const violations = new Map([
  ["session-created-reads-properties-info", (source) => source.replace("const info = (event.properties as any)?.info", "const info = event.properties")],
  ["subagents-classified-by-parent-or-title", (source) => source.replace("!!parentID || title.endsWith", "!!parentID && title.endsWith")],
  ["subagents-registered-for-suppression", (source) => source.replace("subAgentSessions.add(sessionId)", "subAgentSessions.delete(sessionId)")],
  ["subagent-session-capture-suppressed", (source) => source.replace("if (subAgentSessions.has(sessionId)) return", "if (subAgentSessions.has(sessionId)) knownSessions.add(sessionId)")],
  ["subagent-prompt-capture-suppressed", (source) => source.replace("if (subAgentSessions.has(input.sessionID)) return", "if (subAgentSessions.has(input.sessionID)) toolCounts.clear()")],
  ["agents-owns-durable-memory-policy", (source) => source.replace("AGENTS.md owns the durable memory policy", "The plugin owns the durable memory policy")],
  ["memory-instructions-not-embedded", (source) => `const MEMORY_INSTRUCTIONS = "embedded policy";\n${source}`],
  ["private-memory-import-absent", (source) => `${source}\nconst manifest = ".engram/manifest.json";`],
  ["native-compaction-injects-engram-context", (source) => source.replace("output.context.push(data.context)", "output.context.push(\"\")")],
  ["native-compaction-summarizes-before-context", (source) => source.replace("Then IMMEDIATELY call mem_context", "Continue without retrieving context")],
  ["native-compaction-uses-supported-summary-contract", (source) => source.replace("content set to this compacted summary", "project set for this compacted summary")],
]);

test("accepts the public repository-managed Engram plugin", () => {
  assert.deepEqual(verifyEngramPlugin(pluginSource), []);
  assert.doesNotThrow(() => execFileSync(process.execPath, [verifierPath, pluginPath]));
});

test("reports every violated invariant", async (t) => {
  assert.deepEqual([...violations.keys()], invariantNames);
  for (const [name, violate] of violations) {
    await t.test(name, () => {
      const changedSource = violate(pluginSource);
      assert.notEqual(changedSource, pluginSource);
      assert.ok(verifyEngramPlugin(changedSource).includes(name));
    });
  }
});

test("CLI fails safely and validator import has no CLI side effects", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "verify-engram-plugin-"));
  const fixturePath = join(fixtureDir, "engram.ts");
  try {
    writeFileSync(fixturePath, pluginSource.replace("AGENTS.md owns the durable memory policy", "plugin owns policy"));
    assert.throws(() => execFileSync(process.execPath, [verifierPath, fixturePath], { stdio: "pipe" }));
    assert.doesNotThrow(() => execFileSync(process.execPath, ["-e", `import(${JSON.stringify(`file://${verifierPath}`)})`]));
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
