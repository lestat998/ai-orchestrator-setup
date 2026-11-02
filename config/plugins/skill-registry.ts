/**
 * skill-registry
 * Refreshes AI Orchestrator's project skill registry when OpenCode starts.
 *
 * Codex and Claude Code use native startup hooks for the same command. OpenCode
 * loads plugins at startup, so this plugin provides the equivalent behavior
 * without depending on shell interpolation or command-file parse-time cwd.
 *
 * Plugin contract (OpenCode v2): the module default-exports `{ id, setup(ctx) }`.
 * `setup` runs once per loaded location, which replaces the v1 plugin factory.
 */

import type { Plugin } from "@opencode/plugin"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

const SkillRegistryPlugin: Plugin.Plugin = {
  id: "skill-registry",
  setup(ctx) {
    async function refreshSkillRegistry() {
      const cwd = ctx.location.directory || ctx.location.project?.directory || process.cwd()

      try {
        await execFileAsync(
          "ai-orchestrator",
          ["skill-registry", "refresh", "--quiet", "--no-gitignore", "--cwd", cwd],
          { timeout: 30_000 },
        )
      } catch (err: any) {
        if (err?.code === "ENOENT") return
        console.error("[skill-registry] refresh failed:", err)
      }
    }

    // Don't await — keep OpenCode startup responsive. The command is
    // fingerprint-cached, so normal startup stays cheap.
    refreshSkillRegistry().catch((err) => {
      console.error("[skill-registry] unexpected refresh error:", err)
    })
  },
}

export default SkillRegistryPlugin
