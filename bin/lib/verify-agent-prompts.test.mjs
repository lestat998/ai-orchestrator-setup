import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { verifyAgentPrompts } from "./verify-agent-prompts.mjs";

const configRoot = fileURLToPath(new URL("../../config", import.meta.url));
const verifierPath = fileURLToPath(new URL("./verify-agent-prompts.mjs", import.meta.url));

test("accepts the public two-stack configuration", () => {
  assert.deepEqual(verifyAgentPrompts(configRoot), []);
  assert.doesNotThrow(() => execFileSync(process.execPath, [verifierPath, configRoot]));
});

test("detects stale topology, unsafe MCPs, and missing request gates", () => {
  const fixture = mkdtempSync(join(tmpdir(), "verify-agent-prompts-"));
  try {
    cpSync(configRoot, fixture, { recursive: true });
    const configPath = join(fixture, "opencode.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.agent["executor-local"] = { mode: "subagent" };
    config.mcp.slack = { type: "remote", url: "https://example.invalid" };
    writeFileSync(configPath, JSON.stringify(config));
    const promptPath = join(fixture, "prompts", "orchestrator.md");
    writeFileSync(promptPath, readFileSync(promptPath, "utf8").replace("## Request Interpretation Gate", "## Missing Gate"));
    const failures = verifyAgentPrompts(fixture);
    assert.ok(failures.includes("unsupported-agent-topology"));
    assert.ok(failures.includes("public-mcp-topology"));
    assert.ok(failures.includes("prompts/orchestrator.md:request-before-context"));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("rejects machine-specific paths in every shipped JSON config", () => {
  const fixture = mkdtempSync(join(tmpdir(), "verify-agent-prompts-"));
  try {
    cpSync(configRoot, fixture, { recursive: true });
    writeFileSync(join(fixture, "tui.json"), JSON.stringify({ plugin: ["/Users/example/private-plugin.ts"] }));
    const failures = verifyAgentPrompts(fixture);
    assert.ok(failures.includes("machine-specific-path:tui.json"));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("validator import has no CLI side effects", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["-e", `import(${JSON.stringify(`file://${verifierPath}`)})`]));
});
