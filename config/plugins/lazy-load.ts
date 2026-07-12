/**
 * lazy-load — trims tool payloads in outbound LLM requests to cut token burn.
 *
 * Patches globalThis.fetch (opencode routes LLM calls through it, including
 * via local proxies). For every request carrying a `tools` array it:
 *   - shortens each tool description to a one-line summary (keeps intent so the
 *     model still knows what each tool does)
 *   - strips the heavy parameter/input schema to `{}`
 * Tool NAMES are preserved, so the model calls tools directly and opencode
 * executes them from prepared.tools, which retain their full definitions.
 *
 * DECISION (proven, do not undo): a `load_tool` gateway does NOT work in
 * opencode v2 — the v2 plugin API has no tool registration, and injecting a
 * synthetic `load_tool` makes opencode reject the call with
 * "Model tried to call unavailable tool 'load_tool'". Descriptions must be
 * trimmed here at the fetch layer, never in the `tool.definition` hook (that
 * hook is a dead type and mutating its schema crashes the provider converter).
 *
 * v2 plugin format. Deployed globally to ~/.config/opencode/plugins/.
 */

function briefOf(description: string): string {
  if (!description) return ""
  const byPeriod = description.split(".")[0]
  const byNewline = description.split("\n")[0].trim()
  let candidate = byPeriod.length <= byNewline.length ? byPeriod : byNewline
  candidate = candidate.replace(/\$\{[^}]*\}/g, "").trim()
  if (candidate.length < 5) return ""
  return candidate.length > 80 ? candidate.slice(0, 77) + "..." : candidate
}

async function extractBody(body: BodyInit | null | undefined): Promise<string> {
  if (!body) return ""
  if (typeof body === "string") return body
  if (body instanceof Uint8Array || body instanceof ArrayBuffer)
    return new TextDecoder().decode(body)
  if (body instanceof Blob) return body.text()
  return ""
}

function trimTools(body: any): number {
  if (!Array.isArray(body.tools)) return 0
  let trimmed = 0

  for (const t of body.tools) {
    // OpenAI: { type: "function", function: { name, description, parameters } }
    const fn = t?.function
    if (fn?.name) {
      if (fn.description) fn.description = briefOf(fn.description) || fn.name
      if (fn.parameters && Object.keys(fn.parameters).length > 0) fn.parameters = {}
      trimmed++
      continue
    }
    // Anthropic: { name, description, input_schema }
    if (t?.name) {
      if (t.description) t.description = briefOf(t.description) || t.name
      if (t.input_schema && Object.keys(t.input_schema).length > 0) t.input_schema = {}
      trimmed++
      continue
    }
    // Google: { functionDeclarations: [...] }
    if (Array.isArray(t?.functionDeclarations)) {
      for (const fd of t.functionDeclarations) {
        if (fd?.name) {
          if (fd.description) fd.description = briefOf(fd.description) || fd.name
          if (fd.parameters && Object.keys(fd.parameters).length > 0) fd.parameters = {}
          trimmed++
        }
      }
    }
  }

  return trimmed
}

const _origFetch = globalThis.fetch
globalThis.fetch = (async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!init?.body || init.method === "GET") return _origFetch(input, init)

  const bodyText = await extractBody(init.body)
  if (!bodyText) return _origFetch(input, init)

  try {
    const body = JSON.parse(bodyText)
    if (Array.isArray(body.tools) && body.tools.length > 0) {
      if (trimTools(body) > 0)
        return _origFetch(input, { ...init, body: JSON.stringify(body) })
    }
  } catch {}

  return _origFetch(input, init)
}) as typeof fetch

export default {
  id: "lazy-load",
  setup: async () => {},
}
