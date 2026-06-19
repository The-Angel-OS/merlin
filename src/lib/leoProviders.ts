/**
 * leoProviders.ts — provider-agnostic model calls for the LEO loop.
 *
 * The loop speaks ONE neutral message format; each adapter translates to/from a
 * provider's wire format and tool-calling shape. Add a provider = add an adapter,
 * the loop and stored history never change.
 *
 * Provider order is funded-path-first: Gemini (free tier) before Anthropic.
 * ponytail: local Ollama would slot in here as a third adapter for cheap turns.
 */
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> }
export type ToolCall = { id: string; name: string; input: Record<string, unknown> }
export type ToolResult = { id: string; name: string; output: unknown }

export type NeutralMsg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] }

export type ModelReply = { text: string; toolCalls: ToolCall[] }
export type Provider = 'gemini' | 'anthropic'

const ANTHROPIC_MODEL = 'claude-sonnet-4-5'
const GEMINI_MODEL = 'gemini-2.5-flash' // 2.5 → free implicit prompt caching on a stable prefix

export function pickProvider(s: { geminiApiKey?: string; anthropicApiKey?: string }): {
  provider: Provider
  key: string
} | null {
  if (s.geminiApiKey) return { provider: 'gemini', key: s.geminiApiKey } // free + funded → first
  if (s.anthropicApiKey) return { provider: 'anthropic', key: s.anthropicApiKey }
  return null
}

export async function callModel(
  provider: Provider,
  key: string,
  system: string,
  messages: NeutralMsg[],
  tools: ToolDef[],
): Promise<ModelReply> {
  return provider === 'gemini'
    ? callGemini(key, system, messages, tools)
    : callAnthropic(key, system, messages, tools)
}

// ─── Anthropic ──────────────────────────────────────────────────────────────
async function callAnthropic(key: string, system: string, messages: NeutralMsg[], tools: ToolDef[]): Promise<ModelReply> {
  const apiMessages = messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.text }
    if (m.role === 'assistant') {
      const content: unknown[] = []
      if (m.text) content.push({ type: 'text', text: m.text })
      for (const tc of m.toolCalls) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      return { role: 'assistant', content }
    }
    return {
      role: 'user',
      content: m.results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: JSON.stringify(r.output).slice(0, 8000),
      })),
    }
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system,
      tools,
      messages: apiMessages,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const data = (await res.json()) as { content?: Array<Record<string, unknown>> }
  const blocks = data.content || []
  const text = blocks.filter((b) => b.type === 'text').map((b) => String(b.text || '')).join('\n').trim()
  const toolCalls: ToolCall[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: String(b.id), name: String(b.name), input: (b.input as Record<string, unknown>) || {} }))
  return { text, toolCalls }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(key: string, system: string, messages: NeutralMsg[], tools: ToolDef[]): Promise<ModelReply> {
  const contents = messages.map((m) => {
    if (m.role === 'user') return { role: 'user', parts: [{ text: m.text }] }
    if (m.role === 'assistant') {
      const parts: unknown[] = []
      if (m.text) parts.push({ text: m.text })
      for (const tc of m.toolCalls) parts.push({ functionCall: { name: tc.name, args: tc.input } })
      return { role: 'model', parts }
    }
    return {
      role: 'user',
      parts: m.results.map((r) => ({
        functionResponse: {
          name: r.name,
          response: r.output && typeof r.output === 'object' ? r.output : { result: r.output },
        },
      })),
    }
  })

  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: geminiSchema(t.input_schema),
  }))

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations }],
      }),
      signal: AbortSignal.timeout(60_000),
    },
  )
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>
  }
  const parts = data.candidates?.[0]?.content?.parts || []
  const text = parts.filter((p) => 'text' in p).map((p) => String(p.text || '')).join('\n').trim()
  const toolCalls: ToolCall[] = parts
    .filter((p) => 'functionCall' in p)
    .map((p, i) => {
      const fc = p.functionCall as { name: string; args?: Record<string, unknown> }
      return { id: `${fc.name}-${i}`, name: fc.name, input: fc.args || {} }
    })
  return { text, toolCalls }
}

// Gemini's function `parameters` is a JSON-Schema subset. Our schemas are simple
// object schemas, but Gemini rejects an object with zero properties — give it a
// throwaway prop in that case. ponytail: expand if a tool needs richer schema.
function geminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const props = (schema.properties as Record<string, unknown>) || {}
  if (Object.keys(props).length === 0) {
    return { type: 'object', properties: { _: { type: 'string', description: 'unused' } } }
  }
  return schema
}
