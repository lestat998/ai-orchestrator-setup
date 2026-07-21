#!/usr/bin/env node
// Migrate a live dcp.jsonc to the current managed defaults without changing
// user-tuned values. Only the three explicit protectedTools lists are managed.
// Comments are dropped on migration; bootstrap creates a backup first.
// Usage: node dcp-migrate.mjs <livePath> <repoDefaultPath>
import { readFileSync, writeFileSync } from "node:fs";

function stripJsonc(source) {
  let output = "";
  let index = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += char;
      }
      index += 1;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (inString) {
      output += char;
      if (char === "\\") {
        output += next ?? "";
        index += 2;
        continue;
      }
      if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      index += 1;
    } else if (char === "/" && next === "/") {
      inLineComment = true;
      index += 2;
    } else if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 2;
    } else {
      output += char;
      index += 1;
    }
  }

  return output.replace(/,(\s*[}\]])/g, "$1");
}

function parseJsonc(path) {
  return JSON.parse(stripJsonc(readFileSync(path, "utf8")));
}

const [, , livePath, defaultPath] = process.argv;
if (!livePath || !defaultPath) {
  console.error("usage: dcp-migrate <livePath> <repoDefaultPath>");
  process.exit(2);
}

try {
  const live = parseJsonc(livePath);
  const defaults = parseJsonc(defaultPath);

  if (defaults.compress?.protectedTools) {
    live.compress = live.compress ?? {};
    live.compress.protectedTools = defaults.compress.protectedTools;
  }
  if (defaults.strategies?.deduplication?.protectedTools) {
    live.strategies = live.strategies ?? {};
    live.strategies.deduplication = live.strategies.deduplication
      ?? { ...defaults.strategies.deduplication };
    live.strategies.deduplication.protectedTools = defaults.strategies.deduplication.protectedTools;
  }
  if (defaults.strategies?.purgeErrors?.protectedTools) {
    live.strategies = live.strategies ?? {};
    live.strategies.purgeErrors = live.strategies.purgeErrors
      ?? { ...defaults.strategies.purgeErrors };
    live.strategies.purgeErrors.protectedTools = defaults.strategies.purgeErrors.protectedTools;
  }

  writeFileSync(livePath, `${JSON.stringify(live, null, 2)}\n`);
} catch (error) {
  console.error(`dcp migration failed: ${error.message}`);
  process.exit(1);
}
