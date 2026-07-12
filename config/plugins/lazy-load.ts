/**
 * lazy-load — strips tool descriptions and schemas from LLM HTTP requests
 *
 * Patches globalThis.fetch at module load. Detects LLM calls by checking
 * for body.tools array. The LLM still calls tools by name — opencode
 * executes from prepared.tools which retain full definitions.
 *
 * v2 plugin format — place in .opencode/plugin/ for auto-discovery.
 */

async function extractBody(
  body: BodyInit | null | undefined,
): Promise<string> {
  if (!body) return ""
  if (typeof body === "string") return body
  if (body instanceof Uint8Array || body instanceof ArrayBuffer)
    return new TextDecoder().decode(body)
  if (body instanceof Blob) return body.text()
  return ""
}

function stripTools(body: any): number {
  if (!Array.isArray(body.tools)) return 0

  let stripped = 0

  for (const t of body.tools) {
    const fn = t?.function
    if (fn?.name) {
      if (fn.description) fn.description = ""
      if (fn.parameters && Object.keys(fn.parameters).length > 0)
        fn.parameters = {}
      stripped++
      continue
    }

    if (t?.name) {
      if (t.description) t.description = ""
      if (t.input_schema && Object.keys(t.input_schema).length > 0)
        t.input_schema = {}
      stripped++
      continue
    }

    if (Array.isArray(t?.functionDeclarations)) {
      for (const fd of t.functionDeclarations) {
        if (fd?.name) {
          if (fd.description) fd.description = ""
          if (fd.parameters && Object.keys(fd.parameters).length > 0)
            fd.parameters = {}
          stripped++
        }
      }
    }
  }

  return stripped
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
      if (stripTools(body) > 0) {
        return _origFetch(input, { ...init, body: JSON.stringify(body) })
      }
    }
  } catch {}

  return _origFetch(input, init)
}) as typeof fetch

export default {
  id: "lazy-load",
  setup: async () => {},
}
