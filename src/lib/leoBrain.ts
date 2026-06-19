/**
 * leoBrain.ts — the PORTABLE conversation engine. Optimus's spark.
 *
 * Pure function of (messages, tool belt, provider config) → reply + tool dispatch.
 * Imports NOTHING platform-specific — no fs, no store, no Merlin tools. The tool
 * belt and provider keys are INJECTED. Drop this same file into Core or Nimue;
 * only the injected belt differs. The neutral message format (leoProviders) is the
 * interop contract — keep it identical across embodiments.
 */
import { pickProvider, callModel, type NeutralMsg, type ToolResult } from './leoProviders'

export type Tool = {
  name: string
  description: string
  input_schema: Record<string, unknown>
  run: (input: Record<string, unknown>) => Promise<unknown>
}

export type ProviderConfig = { geminiApiKey?: string; anthropicApiKey?: string }

export type BrainResult = {
  messages: NeutralMsg[] // full transcript incl. the new turn(s); caller persists
  response: string
  steps: number
  toolsUsed: string[]
  provider: string
}

const MAX_STEPS = 6 // ponytail: tool-loop ceiling; raise if real workflows need more hops

export async function runBrain(opts: {
  messages: NeutralMsg[] // prior history (without the new user turn)
  userText: string
  tools: Tool[]
  providerConfig: ProviderConfig
  system: string
}): Promise<BrainResult> {
  const picked = pickProvider(opts.providerConfig)
  if (!picked) throw new Error('No AI key set — add a Gemini or Anthropic key.')

  const working: NeutralMsg[] = [...opts.messages, { role: 'user', text: opts.userText }]
  const defs = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  const byName = new Map(opts.tools.map((t) => [t.name, t]))
  const toolsUsed: string[] = []
  let steps = 0
  let finalText = ''

  while (steps < MAX_STEPS) {
    steps++
    const reply = await callModel(picked.provider, picked.key, opts.system, working, defs)
    if (reply.text) finalText = reply.text
    working.push({ role: 'assistant', text: reply.text, toolCalls: reply.toolCalls })
    if (reply.toolCalls.length === 0) break

    const results: ToolResult[] = []
    for (const tc of reply.toolCalls) {
      toolsUsed.push(tc.name)
      const tool = byName.get(tc.name)
      let output: unknown
      try {
        output = tool ? await tool.run(tc.input || {}) : { error: `unknown tool ${tc.name}` }
      } catch (e) {
        output = { error: e instanceof Error ? e.message : String(e) }
      }
      results.push({ id: tc.id, name: tc.name, output })
    }
    working.push({ role: 'tool', results })
  }

  return {
    messages: working,
    response: finalText || '(no text response)',
    steps,
    toolsUsed,
    provider: picked.provider,
  }
}
