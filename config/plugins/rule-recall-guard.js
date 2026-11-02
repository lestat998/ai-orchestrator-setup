/**
 * rule-recall-guard
 * 1. Blocks delegations whose prompt has no `Applicable rules:` section.
 * 2. Recalls the Engram preference rules that match each user message and adds
 *    them to the system context for that session.
 *
 * The orchestrator must recall matching memory rules before every delegation
 * and cite them in the prompt. OpenCode runs the tool `execute.before` hook
 * ahead of each tool call, and an error thrown from it fails the call, so this
 * plugin enforces the rule at the tool boundary instead of relying on the prompt.
 *
 * The session `prompt` hook queries the local Engram HTTP server with the
 * message terms and stores the matching rules per session; the session
 * `context` hook appends them to the system prompt so recall no longer depends
 * on the model. Recall failures are swallowed: the session hooks never throw.
 *
 * Plugin contract (OpenCode v2): the module default-exports `{ id, setup(ctx) }`.
 * v1 mapping: tool.execute.before → ctx.tool.hook("execute.before"),
 * chat.message → ctx.session.hook("prompt"),
 * experimental.chat.system.transform → ctx.session.hook("context").
 */

import { execFileSync } from "node:child_process"

const MARKER = "Applicable rules:"

const BLOCKED_MESSAGE =
  "Delegation blocked by rule-recall-guard: the task prompt has no `Applicable rules:` section. " +
  'Run mem_search with type "preference" using the concrete terms from the user\'s request (commands, paths, identifiers), ' +
  'skip "Superseded" stubs, and add an `Applicable rules:` section citing the matching memory IDs, ' +
  "or `none found (query: ...)`, then retry."

const RECALL_HEADER =
  "Rules recalled from Engram for the current user message (apply them; cite their IDs in any `Applicable rules:` section):"

const MAX_TERMS = 30
const MAX_RULES = 5
const MAX_CONTENT = 600
const SEARCH_TIMEOUT_MS = 1500
// FTS5 bm25 rank: more negative is more relevant. Weaker matches are noise.
const MIN_RELEVANCE_RANK = -3

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was", "one",
  "our", "out", "has", "have", "him", "his", "how", "its", "may", "new", "now", "see", "she", "too",
  "use", "who", "why", "with", "that", "this", "from", "they", "will", "would", "there", "their",
  "what", "when", "which", "about", "into", "than", "then", "them", "these", "some", "could",
  "should", "please", "just", "also", "been", "were", "your", "does", "did",
])

// OpenCode v2 names the delegation tool "subagent"; v1 called it "task".
const DELEGATION_TOOLS = new Set(["subagent", "task"])

function checkDelegation(tool, input) {
  if (!DELEGATION_TOOLS.has(tool)) return null
  if (String(input?.prompt ?? "").includes(MARKER)) return null
  return BLOCKED_MESSAGE
}

function runGit(directory, args) {
  try {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

// Mirrors extractProjectName in engram.ts.
function extractProjectName(directory) {
  const url = runGit(directory, ["remote", "get-url", "origin"])
  if (url) {
    const name = url.replace(/\.git$/, "").split(/[/:]/).pop()
    if (name) return name
  }

  const root = runGit(directory, ["rev-parse", "--show-toplevel"])
  if (root) return root.split("/").pop() || "unknown"

  return String(directory ?? "").split("/").pop() || "unknown"
}

function buildQuery(text) {
  const tokens = String(text ?? "").toLowerCase().match(/[a-z0-9][a-z0-9:_\-/.]{2,}/g) ?? []
  const terms = []
  const seen = new Set()
  for (const token of tokens) {
    if (STOPWORDS.has(token) || seen.has(token)) continue
    seen.add(token)
    terms.push(token)
    if (terms.length === MAX_TERMS) break
  }
  return terms.join(" ")
}

async function search(baseUrl, params) {
  const response = await fetch(`${baseUrl}/search?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!response.ok) return []
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

async function recallRules(query, project) {
  const baseUrl = `http://127.0.0.1:${process.env.ENGRAM_PORT ?? 7437}`
  const common = { q: query, type: "preference", match_mode: "any", limit: String(MAX_RULES) }
  try {
    const [projectRules, personalRules] = await Promise.all([
      search(baseUrl, { ...common, project, scope: "project" }),
      search(baseUrl, { ...common, scope: "personal" }),
    ])
    const seen = new Set()
    const rules = []
    for (const rule of [...projectRules, ...personalRules]) {
      if (seen.has(rule?.id)) continue
      seen.add(rule?.id)
      if (String(rule?.title ?? "").startsWith("Superseded")) continue
      if (typeof rule?.rank === "number" && rule.rank > MIN_RELEVANCE_RANK) continue
      rules.push(rule)
    }
    rules.sort((a, b) => (typeof a.rank === "number" ? a.rank : 0) - (typeof b.rank === "number" ? b.rank : 0))
    return rules.slice(0, MAX_RULES)
  } catch {
    return []
  }
}

function formatRules(rules) {
  const entries = rules.map((rule) => {
    const content = String(rule.content ?? "")
    const body = content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) : content
    return `#${rule.id} ${rule.title}\n${body}`
  })
  return `${RECALL_HEADER}\n\n${entries.join("\n\n")}`
}

// Appends text to the last system part, or adds a part when there is none.
function appendToSystem(system, text) {
  const last = system[system.length - 1]
  if (last) {
    system[system.length - 1] = { ...last, text: last.text + "\n\n" + text }
  } else {
    system.push({ type: "text", text })
  }
}

// OpenCode v2 requires a default export with an id and a setup function.
// Keep it the only export.
export default {
  id: "rule-recall-guard",
  async setup(ctx) {
    const project = extractProjectName(ctx?.location?.directory ?? "")
    const rulesBySession = new Map()

    await ctx.tool.hook("execute.before", (event) => {
      const error = checkDelegation(event.tool, event.input)
      if (error) throw new Error(error)
    })

    await ctx.session.hook("prompt", async (event) => {
      try {
        const sessionID = event?.sessionID
        const query = buildQuery(event?.prompt?.text)
        const rules = query ? await recallRules(query, project) : []
        if (rules.length) rulesBySession.set(sessionID, rules)
        else rulesBySession.delete(sessionID)
      } catch {}
    })

    await ctx.session.hook("context", (event) => {
      try {
        const rules = rulesBySession.get(event?.sessionID)
        if (!rules?.length) return
        appendToSystem(event.system, formatRules(rules))
      } catch {}
    })
  },
}
