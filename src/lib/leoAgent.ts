/**
 * leoAgent.ts — Merlin's adapter around the portable brain (leoBrain).
 *
 * This is the ONLY platform-specific glue: it injects Merlin's tool belt (TOOLS),
 * Merlin's provider keys (from store), and Merlin's persistence (leoChats), then
 * calls the embodiment-agnostic runBrain. Core/Nimue write their own equivalent
 * adapter with a different belt — the brain itself is unchanged.
 */
import { getSettings, appendLog } from './store'
import { TOOLS } from './leoTools'
import { loadConversation, saveConversation } from './leoChats'
import { runBrain } from './leoBrain'
import { reportUsage } from './node-bus'
import type { NeutralMsg } from './leoProviders'

const SYSTEM = `You are LEO, the local AI for this Merlin node — an Angel OS media server that runs on the user's own box. You can use local tools to inspect and change configuration, transcribe URLs, and list media on this machine. Prefer DOING the work with a tool over telling the user to do it by hand (e.g. if asked to set a key, call set_config). Report what you actually did, concisely. Secrets are never shown in full.`

export type AgentResult = { response: string; steps: number; toolsUsed: string[]; provider: string }

export async function runAgent(conversationId: string, userText: string): Promise<AgentResult> {
  const s = getSettings()
  const convo = loadConversation(conversationId)
  const prior: NeutralMsg[] = convo.messages.map(stripAt)

  const startedAt = Date.now()
  const r = await runBrain({
    messages: prior,
    userText,
    tools: TOOLS,
    // Settings first, then env (.env.local) — the LocalSystem service doesn't inherit
    // the user's GEMINI_API_KEY, so the env fallback lets the local override power the brain.
    providerConfig: {
      // Accept Angel OS's GOOGLE_AI_API_KEY name as well as GEMINI_API_KEY.
      geminiApiKey: s.geminiApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
      anthropicApiKey: s.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      // Ollama — local daemon for the config-free free fallback, OR a hosted
      // :cloud model (e.g. nemotron-3-super:cloud) when ollamaModel is a :cloud
      // tag + an account token is set. Settings first, then env.
      ollamaUrl: s.ollamaUrl || process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
      ollamaModel: s.ollamaModel || process.env.OLLAMA_MODEL || '',
      ollamaApiKey: s.ollamaApiKey || process.env.OLLAMA_API_KEY || '',
    },
    system: SYSTEM,
  })

  // Persist only the new turns; keep prior timestamps intact.
  const added = r.messages.slice(prior.length)
  for (const m of added) convo.messages.push({ ...m, at: new Date().toISOString() })
  saveConversation(convo)

  appendLog({
    type: 'angels',
    source: 'leo-agent',
    message: `[${r.provider}] ${userText.slice(0, 50)} (${r.steps} steps; tools: ${r.toolsUsed.join(', ') || 'none'})`,
  })

  // Meter this locally-served brain turn UP to Core's cost ledger (compute commons).
  // Fire-and-forget — reportUsage is fail-soft and won't slow or break the turn.
  void reportUsage({
    provider: r.provider,
    model: s.ollamaModel || process.env.OLLAMA_MODEL || undefined,
    latencyMs: Date.now() - startedAt,
    toolCallCount: r.toolsUsed.length || undefined,
    conversationId,
  })

  return { response: r.response, steps: r.steps, toolsUsed: r.toolsUsed, provider: r.provider }
}

function stripAt(m: { at: string } & NeutralMsg): NeutralMsg {
  const { at: _at, ...rest } = m
  return rest as NeutralMsg
}
