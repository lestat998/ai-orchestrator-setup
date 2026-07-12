/**
 * lazy-load — TRUE lazy tool loading via a `load_tool` gateway.
 *
 * Verified against opencode source (packages/opencode + packages/plugin):
 *  - v2 plugins CANNOT register new tools. The model may only call tools
 *    opencode already knows (built-in / MCP / user). An unknown tool call is
 *    rejected by opencode's tool-runtime: "Model tried to call unavailable
 *    tool '<name>'". (error emitted in packages/llm tool-runtime)
 *  - That rejection reads the LLM RESPONSE, which flows through
 *    globalThis.fetch — our patch. So we rewrite the response: any
 *    `load_tool` tool_use becomes the real tool the model asked for.
 *  - On the REQUEST we strip every real tool definition and inject one
 *    `load_tool` tool (its description lists the available tool names, captured
 *    from the original request) so the model knows what exists without paying
 *    for 105 full schemas.
 *
 * tool.definition hook is also alive (tool/registry.ts:313) but the gateway
 * needs request+response rewrite, which only fetch interception provides.
 *
 * v2 plugin format. Deployed globally to ~/.config/opencode/plugins/.
 *
 * NOTE: every transform is wrapped so a failure degrades to the unmodified
 * request/response — opencode keeps working even if this plugin misbehaves.
 */

const LOAD_TOOL_BASE = {
  name: "load_tool",
  description:
    "Execute any available tool on demand WITHOUT it being pre-loaded. " +
    'Call with { name: "<exact tool name>", args: <that tool’s argument object> }. ' +
    "Always use this instead of calling tools directly to keep context small. " +
    "Available tools: ",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Exact tool name, e.g. 'read'" },
      args: { type: "object", description: "Arguments object for that tool" },
    },
    required: ["name", "args"],
  },
}

type Json = any

function extractBody(body: BodyInit | null | undefined): Promise<string> {
  if (!body) return Promise.resolve("")
  if (typeof body === "string") return Promise.resolve(body)
  if (body instanceof Uint8Array || body instanceof ArrayBuffer)
    return Promise.resolve(new TextDecoder().decode(body))
  if (body instanceof Blob) return body.text()
  return Promise.resolve("")
}

function hasTools(body: Json): boolean {
  return !!body && Array.isArray(body.tools) && body.tools.length > 0
}

function toolName(t: Json): string | undefined {
  return t?.function?.name ?? t?.name
}

function toolFormat(tools: Json[]): "openai" | "anthropic" {
  return tools[0]?.function ? "openai" : "anthropic"
}

// ---- REQUEST: strip real tools, inject load_tool (with name list) ----
function rewriteRequest(body: Json): boolean {
  if (!hasTools(body)) return false
  try {
    const names = body.tools.map(toolName).filter(Boolean) as string[]
    const lt = {
      ...LOAD_TOOL_BASE,
      description: LOAD_TOOL_BASE.description + names.join(", ") + ".",
    }
    const fmt = toolFormat(body.tools)
    body.tools = fmt === "openai" ? [{ type: "function", function: lt }] : [lt]
    return true
  } catch {
    return false
  }
}

// ---- RESPONSE: rewrite load_tool tool_use -> real tool ----
function rewriteToolUseObject(obj: Json): boolean {
  let changed = false
  if (Array.isArray(obj?.content)) {
    for (const b of obj.content) {
      if (b?.type === "tool_use" && b.name === "load_tool" && b.input) {
        const real = b.input.name
        const args = b.input.args ?? {}
        if (typeof real === "string" && real) {
          b.name = real
          b.input = args
          changed = true
        }
      }
    }
  }
  if (Array.isArray(obj?.choices)) {
    for (const c of obj.choices) {
      const tcs = c?.message?.tool_calls
      if (Array.isArray(tcs)) {
        for (const tc of tcs) {
          if (tc?.function?.name === "load_tool") {
            let inp: Json = {}
            try {
              inp = JSON.parse(tc.function.arguments || "{}")
            } catch {}
            const real = inp.name
            const args = inp.args ?? {}
            if (typeof real === "string" && real) {
              tc.function.name = real
              tc.function.arguments = JSON.stringify(args)
              changed = true
            }
          }
        }
      }
    }
  }
  return changed
}

// Streaming SSE: reassemble each tool_use across start+input_json_delta (by
// index), then rewrite load_tool blocks into the real tool on content_block_start
// and drop their deltas (input is complete at start).
function transformSSE(text: string): string | null {
  const rawEvents = text.split("\n\n").map((e) => e.trim()).filter(Boolean)
  const parsed: { event: string; data: Json; raw: string }[] = []
  for (const ev of rawEvents) {
    let event = ""
    const chunks: string[] = []
    for (const line of ev.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim()
      else if (line.startsWith("data:")) chunks.push(line.slice(5).trim())
    }
    if (!chunks.length) {
      parsed.push({ event, data: null, raw: ev })
      continue
    }
    try {
      parsed.push({ event, data: JSON.parse(chunks.join("\n")), raw: ev })
    } catch {
      parsed.push({ event, data: null, raw: ev })
    }
  }

  const deltaByIndex = new Map<number, string>()
  for (const p of parsed) {
    const d = p.data
    if (!d) continue
    if (d.type === "content_block_delta" && d.delta?.type === "input_json_delta") {
      deltaByIndex.set(d.index, (deltaByIndex.get(d.index) ?? "") + (d.delta.partial_json ?? ""))
    }
  }

  let changed = false
  const rewritten = new Set<number>()
  const out: string[] = []
  for (const p of parsed) {
    const d = p.data
    if (
      d &&
      d.type === "content_block_start" &&
      d.content_block?.type === "tool_use" &&
      d.content_block.name === "load_tool"
    ) {
      const idx = d.index
      const partial = deltaByIndex.get(idx) ?? ""
      let input: Json = {}
      try {
        input = partial ? JSON.parse(partial) : d.content_block.input ?? {}
      } catch {
        input = {}
      }
      const real = input.name
      const args = input.args ?? {}
      if (typeof real === "string" && real) {
        d.content_block.name = real
        d.content_block.input = args
        changed = true
        rewritten.add(idx)
      }
      out.push(`event: content_block_start\ndata: ${JSON.stringify(d)}`)
      continue
    }
    if (
      d &&
      d.type === "content_block_delta" &&
      d.delta?.type === "input_json_delta" &&
      rewritten.has(d.index)
    ) {
      continue // drop deltas for rewritten load_tool blocks
    }
    out.push(p.raw)
  }

  return changed ? out.join("\n\n") + "\n\n" : null
}

function transformResponse(text: string): string | null {
  try {
    if (text.includes("event:")) return transformSSE(text)
    const data = JSON.parse(text)
    return rewriteToolUseObject(data) ? JSON.stringify(data) : null
  } catch {
    return null
  }
}

// ---- fetch patch ----
const _origFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (!init?.body || init.method === "GET") return _origFetch(input, init)

  const bodyText = await extractBody(init.body)
  if (!bodyText) return _origFetch(input, init)

  let sent = false
  try {
    const body = JSON.parse(bodyText)
    if (rewriteRequest(body)) {
      sent = true
      init = { ...init, body: JSON.stringify(body) }
    }
  } catch {}

  const res = await _origFetch(input, init)

  // Only rewrite responses to requests we actually rewrote (LLM tool calls).
  if (sent) {
    const ct = res.headers.get("content-type") || ""
    if (ct.includes("text/event-stream") || ct.includes("application/json")) {
      try {
        const txt = await res.text()
        const newTxt = transformResponse(txt)
        const h = new Headers(res.headers)
        h.delete("content-length")
        return new Response(newTxt ?? txt, { status: res.status, headers: h })
      } catch {
        // fall through to original response
      }
    }
  }
  return res
}) as typeof fetch

export default {
  id: "lazy-load",
  setup: async () => {},
}
