/**
 * Engram — OpenCode v2 plugin adapter
 *
 * Thin layer that connects OpenCode's event system to the Engram Go binary.
 * The Go binary runs as a local HTTP server and handles all persistence.
 *
 * Flow:
 *   OpenCode events and hooks → this plugin → HTTP calls → engram serve → SQLite
 *
 * Plugin contract (OpenCode v2):
 *   The module default-exports `{ id, setup(ctx) }`. `setup` registers hooks on
 *   the owning domains and returns a cleanup function. v1 hook mapping:
 *     event                               → ctx.event.subscribe()
 *     chat.message                        → ctx.session.hook("prompt")
 *     tool.execute.after                  → ctx.tool.hook("execute.after")
 *     experimental.chat.system.transform  → ctx.session.hook("context")
 *     experimental.session.compacting     → ctx.session.hook("compaction")
 *
 * Session resilience:
 *   Uses `ensureSession()` before any DB write. This means sessions are
 *   created on-demand — even if the plugin was loaded after the session
 *   started (restart, reconnect, etc.). The session ID comes from OpenCode's
 *   hooks (event.sessionID) rather than relying on a session.created event.
 */

import type { Plugin } from "@opencode/plugin"
import { execFileSync, spawn } from "node:child_process"
import { accessSync, constants } from "node:fs"
import { delimiter, join } from "node:path"

// ─── Configuration ───────────────────────────────────────────────────────────

const ENGRAM_PORT = parseInt(process.env.ENGRAM_PORT ?? "7437")
const ENGRAM_URL = `http://127.0.0.1:${ENGRAM_PORT}`
const ENGRAM_BIN = process.env.ENGRAM_BIN ?? findExecutable("engram") ?? "/opt/homebrew/bin/engram"

// Engram's own MCP tools — don't count these as "tool calls" for session stats
const ENGRAM_TOOLS = new Set([
  "mem_search",
  "mem_save",
  "mem_update",
  "mem_delete",
  "mem_suggest_topic_key",
  "mem_save_prompt",
  "mem_session_summary",
  "mem_context",
  "mem_stats",
  "mem_timeline",
  "mem_get_observation",
  "mem_session_start",
  "mem_session_end",
])

// Delegation tools whose output is passively captured. OpenCode v2 names the
// delegation tool "subagent"; v1 called it "task".
const DELEGATION_TOOLS = new Set(["subagent", "task"])

const SESSION_LOOKUP_TIMEOUT_MS = 1000

// ─── HTTP Client ─────────────────────────────────────────────────────────────

async function engramFetch(
  path: string,
  opts: { method?: string; body?: any } = {}
): Promise<any> {
  try {
    const res = await fetch(`${ENGRAM_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    return await res.json()
  } catch {
    // Engram server not running — silently fail
    return null
  }
}

async function isEngramRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${ENGRAM_URL}/health`, {
      signal: AbortSignal.timeout(500),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findExecutable(name: string): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {}
  }
  return undefined
}

function runGit(directory: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

function extractProjectName(directory: string): string {
  // Try git remote origin URL
  const url = runGit(directory, ["remote", "get-url", "origin"])
  if (url) {
    const name = url.replace(/\.git$/, "").split(/[/:]/).pop()
    if (name) return name
  }

  // Fallback: git root directory name (works in worktrees)
  const root = runGit(directory, ["rev-parse", "--show-toplevel"])
  if (root) return root.split("/").pop() ?? "unknown"

  // Final fallback: cwd basename
  return directory.split("/").pop() ?? "unknown"
}

function startDetached(command: string[], cwd?: string): void {
  try {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: "ignore" })
    child.on("error", () => {})
    child.unref()
  } catch {
    // Binary not found or can't start — plugin will silently no-op
  }
}

function truncate(str: string, max: number): string {
  if (!str) return ""
  return str.length > max ? str.slice(0, max) + "..." : str
}

/**
 * Strip <private>...</private> tags before sending to engram.
 * Double safety: the Go binary also strips, but we strip here too
 * so sensitive data never even hits the wire.
 */
function stripPrivateTags(str: string): string {
  if (!str) return ""
  return str.replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]").trim()
}

type SystemPart = { type: "text"; text: string }

/** Appends text to the last system part, or adds a part when there is none. */
function appendToSystem(system: SystemPart[], text: string): void {
  const last = system[system.length - 1]
  if (last) {
    system[system.length - 1] = { ...last, text: last.text + text }
  } else {
    system.push({ type: "text", text: text.trimStart() })
  }
}

function toolResultText(result: any): string {
  if (!result) return ""
  if (typeof result.content === "string") return result.content
  if (Array.isArray(result.content)) {
    const text = result.content
      .filter((part: any) => part?.type === "text")
      .map((part: any) => part.text ?? "")
      .join("\n")
    if (text) return text
  }
  return JSON.stringify(result)
}

// ─── Plugin Definition ───────────────────────────────────────────────────────

const EngramPlugin: Plugin.Plugin = {
  id: "engram",
  async setup(ctx) {
    const directory: string = ctx.location.directory
    const oldProject = directory.split("/").pop() ?? "unknown"
    const project = extractProjectName(directory)

    // Track tool counts per session (in-memory only, not critical)
    const toolCounts = new Map<string, number>()

    // Track last nudge time per session to debounce save reminders
    const lastNudgeTime = new Map<string, number>() // sessionID -> epoch seconds

    // Track which sessions we've already ensured exist in engram
    const knownSessions = new Set<string>()

    // Track sub-agent session IDs so we can suppress their tool-hook registrations.
    // Sub-agents (delegation calls) have a parentID or a title ending in " subagent)".
    // We must not register them as top-level Engram sessions — they cause session
    // inflation (e.g. 170 sessions for 1 real conversation, issue #116).
    const subAgentSessions = new Set<string>()

    // Sessions already classified (top-level or sub-agent), so a session lookup
    // runs at most once per session.
    const classifiedSessions = new Set<string>()

    function classify(sessionId: string, parentID: unknown, title: string): void {
      classifiedSessions.add(sessionId)
      // Detection heuristics:
      //   - parentID is set on all delegated sub-agent sessions
      //   - title ends with " subagent)" as a secondary signal
      const isSubAgent = !!parentID || title.endsWith(" subagent)")
      // Remember sub-agent sessions so tool-hook calls to ensureSession()
      // are also suppressed for them.
      if (isSubAgent) subAgentSessions.add(sessionId)
    }

    /**
     * Event delivery is asynchronous, so a hook can fire before the
     * session.created event is processed. Look the session up once instead of
     * registering a sub-agent by mistake.
     */
    async function ensureClassified(sessionId: string): Promise<void> {
      if (!sessionId || classifiedSessions.has(sessionId)) return
      try {
        const info: any = await ctx.session.get(
          { sessionID: sessionId },
          { signal: AbortSignal.timeout(SESSION_LOOKUP_TIMEOUT_MS) },
        )
        classify(sessionId, info?.parentID, info?.title ?? "")
      } catch {
        // Lookup failed — treat as top-level, matching the event-only behavior.
        classifiedSessions.add(sessionId)
      }
    }

    /**
     * Ensure a session exists in engram. Idempotent — calls POST /sessions
     * which uses INSERT OR IGNORE. Safe to call multiple times.
     *
     * Silently skips sub-agent sessions (tracked in `subAgentSessions`).
     */
    async function ensureSession(sessionId: string): Promise<void> {
      if (!sessionId || knownSessions.has(sessionId)) return
      await ensureClassified(sessionId)
      // Do not register sub-agent sessions in Engram (issue #116).
      if (subAgentSessions.has(sessionId)) return
      knownSessions.add(sessionId)
      await engramFetch("/sessions", {
        method: "POST",
        body: {
          id: sessionId,
          project,
          directory,
        },
      })
    }

    // Try to start engram server if not running
    const running = await isEngramRunning()
    if (!running) {
      startDetached([ENGRAM_BIN, "serve"])
      await new Promise((r) => setTimeout(r, 500))
    }

    // Migrate project name if it changed (one-time, idempotent)
    // Must run AFTER server startup to ensure the endpoint is available
    if (oldProject !== project) {
      await engramFetch("/projects/migrate", {
        method: "POST",
        body: { old_project: oldProject, new_project: project },
      })
    }

    // ─── Event Listeners ───────────────────────────────────────────

    const events = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({
          types: ["session.created", "session.deleted"],
          signal: events.signal,
        })) {
          // --- Session Created ---
          if (event.type === "session.created") {
            // v2 events carry the session payload under event.data.
            const data: any = event.data
            const sessionId: string = data?.sessionID
            if (sessionId) {
              // Sub-agent sessions must NOT be registered as top-level Engram
              // sessions. They cause massive session inflation (e.g. 170
              // sessions for 1 real conversation). classify() remembers them so
              // ensureSession() suppresses every later registration.
              classify(sessionId, data?.parentID, data?.title ?? "")
              await ensureSession(sessionId)
            }
          }

          // --- Session Deleted ---
          if (event.type === "session.deleted") {
            const data: any = event.data
            const sessionId: string = data?.sessionID
            if (sessionId) {
              toolCounts.delete(sessionId)
              knownSessions.delete(sessionId)
              subAgentSessions.delete(sessionId)
              classifiedSessions.delete(sessionId)
              lastNudgeTime.delete(sessionId)
            }
          }
        }
      } catch {
        // Subscription ended (cleanup or server shutdown) — nothing to do
      }
    })()

    // ─── User Prompt Capture ──────────────────────────────────────
    // The prompt hook runs once per user prompt admission, before the LLM sees
    // it. It does not run for synthetic, shell, or compaction messages.

    await ctx.session.hook("prompt", async (event) => {
      await ensureClassified(event.sessionID)
      // Skip sub-agent sessions — they inflate session counts (issue #116)
      if (subAgentSessions.has(event.sessionID)) return

      const sessionId = event.sessionID
      const finalContent = (event.prompt?.text ?? "").trim()

      // Only capture non-trivial prompts (>10 chars)
      if (finalContent.length > 10) {
        await ensureSession(sessionId)
        await engramFetch("/prompts", {
          method: "POST",
          body: {
            session_id: sessionId,
            content: stripPrivateTags(truncate(finalContent, 2000)),
            project,
          },
        })
      }
    })

    // ─── Tool Execution Hook ─────────────────────────────────────
    // Count tool calls per session (for session end stats).
    // Also ensures the session exists — handles plugin reload / reconnect.
    // Passive capture: when a delegation tool completes, POST its output to
    // the passive capture endpoint so the server extracts learnings.

    await ctx.tool.hook("execute.after", async (event) => {
      if (ENGRAM_TOOLS.has(event.tool.toLowerCase())) return

      const sessionId = event.sessionID
      if (sessionId) {
        await ensureSession(sessionId)
        toolCounts.set(sessionId, (toolCounts.get(sessionId) ?? 0) + 1)
      }

      // Passive capture: extract learnings from delegation tool output
      if (
        DELEGATION_TOOLS.has(event.tool.toLowerCase()) &&
        event.status === "completed" &&
        sessionId
      ) {
        const text = toolResultText(event.result)
        if (text.length > 50) {
          await engramFetch("/observations/passive", {
            method: "POST",
            body: {
              session_id: sessionId,
              content: stripPrivateTags(text),
              project,
              source: "task-complete",
            },
          })
        }
      }
    })

    // ─── Save nudge ─────────────────────────────────────────────
    // AGENTS.md owns the durable memory policy. This hook adds only a debounced
    // reminder when the session has gone a long time without saving.
    await ctx.session.hook("context", async (event) => {
      // If it has been a long time since the last mem_save, append a reminder
      // to the system prompt so the agent notices. All fetches are fire-and-
      // forget with short timeouts — any failure silently skips the nudge.
      try {
        const sessionID: string = event.sessionID ?? ""
        if (!sessionID || subAgentSessions.has(sessionID)) return

        // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC with no
        // zone suffix; new Date() would parse that as local time. Normalize to
        // UTC first so the thresholds are correct in every timezone.
        const toEpochSecs = (ts: string): number => {
          if (!ts) return 0
          const normalized = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z"
          const ms = new Date(normalized).getTime()
          return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000)
        }

        const cooldownSecs = parseInt(process.env.ENGRAM_NUDGE_COOLDOWN_SECS ?? "900", 10)
        const nowSecs = Math.floor(Date.now() / 1000)

        // Debounce: skip if we nudged recently this session
        const lastNudge = lastNudgeTime.get(sessionID)
        if (lastNudge !== undefined && nowSecs - lastNudge < cooldownSecs) return

        // Skip if the session is too young (< 5 minutes)
        let sessionStartEpoch = 0
        try {
          const sessionRes = await fetch(`${ENGRAM_URL}/sessions/${encodeURIComponent(sessionID)}`, {
            signal: AbortSignal.timeout(200),
          })
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json()
            const startedAt: string = sessionData?.started_at ?? ""
            if (startedAt) {
              sessionStartEpoch = toEpochSecs(startedAt)
            }
          }
        } catch {
          // Server unreachable or timed out — skip nudge
          return
        }
        if (sessionStartEpoch > 0 && nowSecs - sessionStartEpoch < 300) return

        // Check when the last observation was saved for this project
        let lastObsEpoch = 0
        try {
          const obsRes = await fetch(
            `${ENGRAM_URL}/observations?project=${encodeURIComponent(project)}&limit=1&sort=created_at:desc`,
            { signal: AbortSignal.timeout(200) }
          )
          if (obsRes.ok) {
            const obsData = await obsRes.json()
            const createdAt: string = obsData?.[0]?.created_at ?? ""
            if (createdAt) {
              lastObsEpoch = toEpochSecs(createdAt)
            }
          }
        } catch {
          // Server unreachable or timed out — skip nudge
          return
        }

        // No observations yet — nothing to nudge about
        if (lastObsEpoch === 0) return

        // Only nudge if last save was more than 15 minutes ago
        if (nowSecs - lastObsEpoch < 900) return

        // Append the nudge to the last system part
        const nudge =
          "\n\nMEMORY REMINDER: It's been over 15 minutes since your last memory save. " +
          "If you've made decisions, discoveries, completed significant work, or found non-obvious things, " +
          "call mem_save now."
        appendToSystem(event.system as SystemPart[], nudge)
        lastNudgeTime.set(sessionID, nowSecs)
      } catch {
        // Any unexpected error — silently skip the nudge, never crash the hook
      }
    })

    // ─── Compaction Hook: Inject recovery guidance ──────────────
    // Compaction is triggered by the system (not the agent) when context
    // gets too long. The old agent "dies" and a new one starts with the
    // compacted summary. This hook does not persist a checkpoint. It can only
    // inject existing context and recovery instructions into the prompt.

    await ctx.session.hook("compaction", async (event) => {
      if (event.sessionID) {
        await ensureSession(event.sessionID)
      }
      const system = event.system as SystemPart[]

      // Inject context from previous sessions
      const data = await engramFetch(
        `/context?project=${encodeURIComponent(project)}`
      )
      if (data?.context) {
        system.push({ type: "text", text: data.context })
      }

      // Tell the compressor to instruct the new agent to persist the
      // compacted summary to Engram. The new agent reads the compacted
      // summary and this instruction, then saves it as a session summary.
      system.push({
        type: "text",
        text:
          `CRITICAL INSTRUCTION FOR COMPACTED SUMMARY:\n` +
          `The agent has access to Engram persistent memory via MCP tools.\n` +
          `You MUST include the following instruction at the TOP of the compacted summary:\n\n` +
          `"FIRST ACTION REQUIRED: Call mem_session_summary with the content of this compacted summary. ` +
          `Use session_id: '${event.sessionID}'. This preserves what was accomplished before compaction. Do this BEFORE any other work. ` +
          `Then IMMEDIATELY call mem_context, search for the latest ` +
          `'orchestrator/session-checkpoint/${event.sessionID}' observation, and retrieve it with mem_get_observation. ` +
          `Re-observe any state required by its exact next action before continuing."\n\n` +
          `The hook does not persist a checkpoint. Recovery is only complete after those Engram reads succeed.`,
      })
    })

    // Hook registrations are disposed by OpenCode; stop the event loop here.
    return () => events.abort()
  },
}

export default EngramPlugin
