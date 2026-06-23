/**
 * node-bus — Merlin's side of node↔LEO comms over Core's message bus (Model B).
 * See docs/architecture/NODE_BUS_COMMS.md in the Core repo.
 *
 * One outbound loop does three jobs: re-register (heartbeat → keeps the node green +
 * refreshes the node token), poll this node's dedicated bus channel for commands, and
 * post results back as messages. Outbound-only — NAT needs no inbound reach.
 */
import { buildNodeCatalog } from '@/lib/node-catalog'
import { getSettings, updateSettings, appendLog } from '@/lib/store'
import { listSharedMedia } from '@/lib/nodeSkills'

const HEARTBEAT_MS = 120_000 // re-register every 2 min (Core's online window is 5 min)
const POLL_MS = 8_000 // poll the command channel every 8s

/** requestIds already handled this process — belt-and-braces over the cursor. */
const processed = new Set<string>()

type RegisterArgs = { endeavor?: string; angelsUrl?: string; key?: string }
type CoreRegister = {
  ok?: boolean
  channel?: string
  spaceId?: string
  nodeToken?: string
  nodeTokenExpiresAt?: string
  error?: string
}

/**
 * Register (or re-register) this node UP to its endeavor on Core. Persists the bus
 * binding (channel, space, freshly-minted node token) returned by Core. Idempotent.
 */
export async function registerNode(args: RegisterArgs = {}): Promise<{ ok: boolean; status: number; core: CoreRegister }> {
  const s = getSettings()
  const endeavor = (args.endeavor || s.boundEndeavor || '').trim()
  const angelsUrl = (args.angelsUrl || s.boundAngelsUrl || process.env.NEXT_PUBLIC_ANGELS_URL || '').replace(/\/$/, '')
  const key = args.key || process.env.NODE_REGISTER_KEY || ''
  if (!endeavor) return { ok: false, status: 400, core: { error: 'endeavor is required' } }
  if (!angelsUrl) return { ok: false, status: 400, core: { error: 'angelsUrl (or NEXT_PUBLIC_ANGELS_URL) required' } }

  const catalog = await buildNodeCatalog()
  const node = { id: catalog.hostname, ...catalog }

  const res = await fetch(`${angelsUrl}/api/node-ops/register${key ? `?key=${encodeURIComponent(key)}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endeavor, node }),
  })
  const core = (await res.json().catch(() => ({}))) as CoreRegister
  if (!res.ok) return { ok: false, status: res.status, core }

  // Persist the bus binding so the heartbeat + poll can run autonomously.
  updateSettings({
    boundEndeavor: endeavor,
    boundAngelsUrl: angelsUrl,
    ...(core.nodeToken ? { nodeToken: core.nodeToken } : {}),
    ...(core.nodeTokenExpiresAt ? { nodeTokenExpiresAt: core.nodeTokenExpiresAt } : {}),
    ...(core.channel ? { busChannel: core.channel } : {}),
    ...(core.spaceId ? { busSpaceId: String(core.spaceId) } : {}),
  })
  return { ok: true, status: res.status, core }
}

/** Authenticate to Core as the node system-user via the payload-token cookie. */
function coreFetch(base: string, path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), 'Content-Type': 'application/json', Cookie: `payload-token=${token}` },
  })
}

type BusMessage = {
  content?: unknown
  createdAt?: string
  metadata?: { kind?: string; requestId?: string; tool?: string; args?: Record<string, unknown> } | null
}

/** Run the matching skill for a node-command and return human-readable result text. */
async function runCommand(tool: string, cmdArgs: Record<string, unknown>): Promise<{ text: string }> {
  if (tool === 'list_media') {
    const r = listSharedMedia({ query: typeof cmdArgs.query === 'string' ? cmdArgs.query : undefined })
    if (!r.ok) return { text: `Could not list files: ${r.error}.` }
    if (!r.count) return { text: `No matching files across shared roots (${r.roots.join(', ') || 'none'}).` }
    const lines = r.files.slice(0, 50).map((f) => `- ${f.path} — ${f.sizeMB} MB`)
    const more = r.count > lines.length ? `\n…and ${r.count - lines.length} more.` : ''
    return { text: `Found ${r.count} file(s) across ${r.roots.join(', ')}:\n${lines.join('\n')}${more}` }
  }
  if (tool === 'chat') {
    // The Merlin Console: run the message through this node's LOCAL brain + tool belt.
    const message = typeof cmdArgs.message === 'string' ? cmdArgs.message : ''
    if (!message.trim()) return { text: '(empty message)' }
    try {
      const { runAgent } = await import('./leoAgent')
      const convoId = typeof cmdArgs.conversationId === 'string' ? cmdArgs.conversationId : 'node-console'
      const r = await runAgent(convoId, message)
      const used = r.toolsUsed.length ? `\n\n_(${r.provider} · tools: ${r.toolsUsed.join(', ')})_` : `\n\n_(${r.provider})_`
      return { text: `${r.response}${used}` }
    } catch (e) {
      return { text: `Local brain error: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  return { text: `Unknown skill "${tool}".` }
}

/**
 * One poll tick: pull pending commands on this node's channel, run them, post results.
 * Advances the cursor so each command is handled once.
 */
export async function pollOnce(): Promise<{ handled: number }> {
  const s = getSettings()
  if (!s.boundEndeavor || !s.nodeToken || !s.busChannel || !s.busSpaceId) return { handled: 0 }

  const qs = new URLSearchParams({ spaceId: s.busSpaceId, channel: s.busChannel, limit: '50' })
  if (s.busCursor) qs.set('since', s.busCursor)

  let messages: BusMessage[] = []
  try {
    const res = await coreFetch(s.boundAngelsUrl, `/api/ai-bus/poll?${qs.toString()}`, s.nodeToken)
    if (!res.ok) {
      if (res.status === 401) appendLog({ type: 'error', source: 'node-bus', message: 'poll 401 — node token expired/invalid; will refresh on next heartbeat' })
      return { handled: 0 }
    }
    const data = (await res.json()) as { messages?: BusMessage[] }
    messages = data.messages || []
  } catch (e) {
    appendLog({ type: 'error', source: 'node-bus', message: `poll failed: ${e instanceof Error ? e.message : e}` })
    return { handled: 0 }
  }

  let newest = s.busCursor
  let handled = 0
  for (const m of messages) {
    if (m.createdAt && m.createdAt > newest) newest = m.createdAt
    const meta = m.metadata
    if (!meta || meta.kind !== 'node-command' || !meta.tool) continue
    const requestId = meta.requestId || ''
    if (requestId && processed.has(requestId)) continue
    if (requestId) processed.add(requestId)

    const { text } = await runCommand(meta.tool, meta.args || {})
    const reply = `${text}${requestId ? `\n\n_(request ${requestId})_` : ''}`
    try {
      const post = await coreFetch(s.boundAngelsUrl, '/api/chat/send', s.nodeToken, {
        method: 'POST',
        body: JSON.stringify({ space: s.busSpaceId, channel: s.busChannel, content: reply, messageType: 'system' }),
      })
      if (post.ok) {
        handled++
        appendLog({ type: 'angels', source: 'node-bus', message: `answered ${meta.tool} on #${s.busChannel}` })
      } else {
        appendLog({ type: 'error', source: 'node-bus', message: `result post ${post.status} for ${meta.tool}` })
      }
    } catch (e) {
      appendLog({ type: 'error', source: 'node-bus', message: `result post failed: ${e instanceof Error ? e.message : e}` })
    }
  }

  if (newest && newest !== s.busCursor) updateSettings({ busCursor: newest })
  return { handled }
}

export type StreamMessage = {
  id: number | string
  kind: string // 'node-command' | 'node-result' | messageType
  tool?: string
  requestId?: string
  text: string
  author?: string
  createdAt?: string
}

/**
 * Read recent messages on this node's bus channel for the LEO comm-stream inspector.
 * Read-only — does NOT advance the poll cursor (so it never steals commands from the loop).
 */
export async function readNodeStream(limit = 40): Promise<{
  ok: boolean
  bound: boolean
  channel?: string
  messages: StreamMessage[]
  error?: string
}> {
  const s = getSettings()
  if (!s.boundEndeavor || !s.nodeToken || !s.busChannel || !s.busSpaceId) {
    return { ok: true, bound: false, messages: [] }
  }
  const qs = new URLSearchParams({ spaceId: s.busSpaceId, channel: s.busChannel, limit: String(limit) })
  try {
    const res = await coreFetch(s.boundAngelsUrl, `/api/ai-bus/poll?${qs.toString()}`, s.nodeToken)
    if (!res.ok) return { ok: false, bound: true, channel: s.busChannel, messages: [], error: `poll ${res.status}` }
    const data = (await res.json()) as { messages?: Array<Record<string, unknown>> }
    const messages: StreamMessage[] = (data.messages || []).map((m) => {
      const meta = (m.metadata || {}) as { kind?: string; tool?: string; requestId?: string }
      const content = m.content as { text?: string } | string | undefined
      const text = typeof content === 'string' ? content : content?.text || ''
      const author = m.author as { name?: string; email?: string } | string | undefined
      return {
        id: m.id as number,
        kind: meta.kind || (m.messageType as string) || 'message',
        tool: meta.tool,
        requestId: meta.requestId,
        text,
        author: typeof author === 'object' ? author?.name || author?.email : (author as string),
        createdAt: m.createdAt as string,
      }
    })
    messages.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    return { ok: true, bound: true, channel: s.busChannel, messages }
  } catch (e) {
    return { ok: false, bound: true, messages: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/** Process-wide singleton so HMR / multiple imports don't start parallel loops. */
declare global {
  // eslint-disable-next-line no-var
  var __merlinNodeBusLoop: { heartbeat?: NodeJS.Timeout; poll?: NodeJS.Timeout } | undefined
}

/** Start the heartbeat + poll loop once. No-op until the node is bound to an endeavor. */
export function startNodeBusLoop(): void {
  if (globalThis.__merlinNodeBusLoop) return
  globalThis.__merlinNodeBusLoop = {}

  const heartbeat = async () => {
    if (!getSettings().boundEndeavor) return
    try {
      const r = await registerNode()
      if (!r.ok) appendLog({ type: 'error', source: 'node-bus', message: `heartbeat register ${r.status}: ${r.core.error || ''}` })
    } catch (e) {
      appendLog({ type: 'error', source: 'node-bus', message: `heartbeat failed: ${e instanceof Error ? e.message : e}` })
    }
  }

  // Kick once on boot (refresh token + lastSeen), then on intervals.
  void heartbeat()
  globalThis.__merlinNodeBusLoop.heartbeat = setInterval(() => void heartbeat(), HEARTBEAT_MS)
  globalThis.__merlinNodeBusLoop.poll = setInterval(() => void pollOnce(), POLL_MS)
  appendLog({ type: 'system', source: 'node-bus', message: 'node bus loop started (heartbeat 2m, poll 8s)' })
}
