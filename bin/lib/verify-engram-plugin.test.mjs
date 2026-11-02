import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { invariantNames, verifyEngramPlugin } from "./verify-engram-plugin.mjs";

const pluginPath = fileURLToPath(
  new URL("../../config/plugins/engram.ts", import.meta.url),
);
const verifierPath = fileURLToPath(new URL("./verify-engram-plugin.mjs", import.meta.url));
const pluginSource = readFileSync(pluginPath, "utf8");
const bootstrapSource = readFileSync(fileURLToPath(new URL("../bootstrap", import.meta.url)), "utf8");

const violations = new Map([
  [
    "v2-default-plugin-definition",
    (source) => source.replace("export default EngramPlugin", "export { EngramPlugin }"),
  ],
  [
    "no-v1-plugin-factory-export",
    (source) => `${source}\nexport const Engram = async (ctx) => ({})\n`,
  ],
  [
    "session-created-reads-event-data",
    (source) => source.replace(
      "const data: any = event.data\n            const sessionId: string = data?.sessionID\n",
      "const data: any = (event as any).properties?.info\n            const sessionId: string = data?.id\n",
    ),
  ],
  [
    "subagents-classified-by-parent-or-title",
    (source) => source.replace("!!parentID || title.endsWith", "!!parentID && title.endsWith"),
  ],
  [
    "subagents-registered-for-suppression",
    (source) => source.replace("subAgentSessions.add(sessionId)", "subAgentSessions.delete(sessionId)"),
  ],
  [
    "subagent-session-capture-suppressed",
    (source) => source.replace(
      "if (subAgentSessions.has(sessionId)) return",
      "if (subAgentSessions.has(sessionId)) knownSessions.add(sessionId)",
    ),
  ],
  [
    "subagent-prompt-capture-suppressed",
    (source) => source.replace(
      "if (subAgentSessions.has(event.sessionID)) return",
      "if (subAgentSessions.has(event.sessionID)) toolCounts.clear()",
    ),
  ],
  [
    "agents-owns-durable-memory-policy",
    (source) => source.replace(
      "AGENTS.md owns the durable memory policy",
      "The plugin owns the durable memory policy",
    ),
  ],
  [
    "memory-instructions-not-embedded",
    (source) => `const MEMORY_INSTRUCTIONS = "embedded policy";\n${source}`,
  ],
  [
    "private-memory-import-absent",
    (source) => `${source}\nconst manifest = ".engram/manifest.json";`,
  ],
  [
    "native-compaction-summarizes-before-context",
    (source) => source.replace(
      "Then IMMEDIATELY call mem_context,",
      "Continue without retrieving session context.",
    ),
  ],
  [
    "compaction-hook-does-not-claim-checkpoint-persistence",
    (source) => source.replaceAll(
      "hook does not persist a checkpoint",
      "hook automatically persists a checkpoint",
    ),
  ],
  [
    "native-compaction-recovers-session-checkpoint",
    (source) => source.replace(
      "retrieve it with mem_get_observation",
      "continue without retrieving it",
    ),
  ],
]);

test("accepts the repository-managed Engram plugin and harmless edits", () => {
  assert.deepEqual(verifyEngramPlugin(pluginSource), []);
  const harmlessEdit = pluginSource.replace(
    'const isSubAgent = !!parentID || title.endsWith(" subagent)")',
    'const isSubAgent =\n          !!parentID\n          ||\n          title.endsWith(" subagent)")',
  );
  assert.deepEqual(
    verifyEngramPlugin(`// Harmless repository comment.\n\n${harmlessEdit}\n`),
    [],
  );
  assert.doesNotThrow(() => execFileSync(process.execPath, [verifierPath, pluginPath]));
});

test("reports every violated ownership invariant", async (t) => {
  assert.deepEqual([...violations.keys()], invariantNames);

  for (const [name, violate] of violations) {
    await t.test(name, () => {
      const changedSource = violate(pluginSource);
      assert.notEqual(changedSource, pluginSource, `fixture must violate ${name}`);
      assert.ok(verifyEngramPlugin(changedSource).includes(name));
    });
  }
});

test("CLI fails safely and names a missing invariant", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "verify-engram-plugin-"));
  const fixturePath = join(fixtureDir, "engram.ts");

  try {
    writeFileSync(
      fixturePath,
      pluginSource.replace(
        "AGENTS.md owns the durable memory policy",
        "The plugin owns the durable memory policy",
      ),
    );

    assert.throws(
      () =>
        execFileSync(process.execPath, [verifierPath, fixturePath], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /agents-owns-durable-memory-policy/);
        return true;
      },
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("bootstrap validates native OpenCode compaction", () => {
  assert.match(bootstrapSource, /Validating native compaction and Engram integration/);
  assert.match(bootstrapSource, /native automatic compaction enabled/);
  assert.match(bootstrapSource, /Engram compaction recovery configured/);
});
