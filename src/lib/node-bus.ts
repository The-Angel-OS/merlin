/**
 * node-bus — Merlin's side of node↔LEO comms over Core's message bus (Model B).
 * See docs/architecture/NODE_BUS_COMMS.md in the Core repo.
 *
 * One outbound loop does three jobs: re-register (heartbeat → keeps the node green +
 * refreshes the node token), poll this node's dedicated bus channel for commands, and
 * post results back as messages. Outbound-only — NAT needs no inbound reach.
 */
import { buildNodeCatalog } from '@/lib/node-catalog'
import { getSettings, updateSettings, appendLog, addSubmittal } from '@/lib/store'
import { listSharedMedia, listBrowsableFiles } from '@/lib/nodeSkills'
import { autoProvisionOllama } from '@/lib/ollama'

const HEARTBEAT_MS = 120_000 // re-register every 2 min (Core's online window is 5 min)
const POLL_MS = 8_000 // poll the command channel every 8s

/**
 * Sentinel that prefixes a structured skill payload embedded in a result message's
 * text (because Core's chat-send drops metadata). Core's node-files handler parses
 * the line `<SENTINEL>:<requestId>:<json>` back into structured data. Keep in sync
 * with the Core-side constant in src/endpoints/node-ops.ts.
 */
const RESULT_SENTINEL = '@@ANGELS_RESULT@@'

/** requestIds already handled this process — belt-and-braces over the cursor. */
const processed = new Set<string>()
/** Per-requestId failed-post attempts, for bounded retry before dead-lettering. */
const attempts = new Map<string, number>()
const MAX_POST_ATTEMPTS = 3

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

/** A unit of locally-served inference to report UP to Core's cost ledger. */
export interface UsageReport {
  provider?: string
  model?: string
  backend?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  tokensPerSec?: number
  latencyMs?: number
  ttftMs?: number
  finishReason?: string
  toolCallCount?: number
  costCents?: number
  conversationId?: string
  occurredAt?: string
}

/**
 * Report a locally-served inference turn UP to Core's Operating-Costs ledger
 * (POST /api/node-ops/usage). This is the compute-commons meter: every brain turn
 * Merlin serves on its OWN compute becomes a CostEvent Core can account/mint on.
 *
 * Fire-and-forget + fail-soft: metering must NEVER break or slow a brain turn.
 * No binding (endeavor/Core URL/key) ⇒ silently skip — a node can contribute
 * intelligence without being bound, it just won't be metered until it is.
 */
export async function reportUsage(usage: UsageReport): Promise<void> {
  try {
    const s = getSettings()
    const endeavor = (s.boundEndeavor || '').trim()
    const angelsUrl = (s.boundAngelsUrl || process.env.NEXT_PUBLIC_ANGELS_URL || '').replace(/\/$/, '')
    const key = process.env.NODE_REGISTER_KEY || ''
    if (!endeavor || !angelsUrl || !key) return // unbound → not metered (by design)

    const catalog = await buildNodeCatalog().catch(() => null)
    const nodeId = catalog?.hostname

    await fetch(`${angelsUrl}/api/node-ops/usage?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endeavor, nodeId, usage }),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => {})
  } catch {
    // never throw — metering is a sidecar, not a dependency.
  }
}

/** Authenticate to Core as the node system-user via the payload-token cookie. */
function coreFetch(base: string, path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), 'Content-Type': 'application/json', Cookie: `payload-token=${token}` },
  })
}

/**
 * File bridge — submit a file (e.g. a camera snapshot) UP into the bound endeavor's
 * Media library via Core's /api/node-ops/media. Bytes ride base64 in JSON (fine for
 * snapshots). Returns the Media URL Core created.
 */
export async function submitSnapshot(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  alt?: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const s = getSettings()
  if (!s.boundEndeavor || !s.nodeToken) return { ok: false, error: 'node is not locked onto an endeavor' }
  try {
    const res = await coreFetch(s.boundAngelsUrl, '/api/node-ops/media', s.nodeToken, {
      method: 'POST',
      body: JSON.stringify({
        endeavor: s.boundEndeavor,
        filename,
        mimetype,
        alt: alt || filename,
        dataBase64: buffer.toString('base64'),
      }),
    })
    const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!res.ok) return { ok: false, error: typeof d?.error === 'string' ? d.error : `media post ${res.status}` }
    if (typeof d?.url === 'string') {
      void addSubmittal({ at: new Date().toISOString(), filename, url: d.url, source: alt || filename, endeavor: s.boundEndeavor }).catch(() => {})
    }
    return { ok: true, url: typeof d?.url === 'string' ? d.url : undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

type BusMessage = {
  content?: unknown
  createdAt?: string
  metadata?: { kind?: string; requestId?: string; tool?: string; args?: Record<string, unknown> } | null
}

/**
 * Run the matching skill for a node-command. Returns human-readable `text` (posted
 * as the chat-visible result) and, for structured skills (e.g. list_files for the
 * directory browser), an optional `data` payload echoed back in the result metadata.
 */
async function runCommand(tool: string, cmdArgs: Record<string, unknown>): Promise<{ text: string; data?: unknown }> {
  if (tool === 'list_media') {
    const r = listSharedMedia({ query: typeof cmdArgs.query === 'string' ? cmdArgs.query : undefined })
    if (!r.ok) return { text: `Could not list files: ${r.error}.` }
    if (!r.count) return { text: `No matching files across shared roots (${r.roots.join(', ') || 'none'}).` }
    const lines = r.files.slice(0, 50).map((f) => `- ${f.path} — ${f.sizeMB} MB`)
    const more = r.count > lines.length ? `\n…and ${r.count - lines.length} more.` : ''
    return { text: `Found ${r.count} file(s) across ${r.roots.join(', ')}:\n${lines.join('\n')}${more}` }
  }
  if (tool === 'list_files') {
    // Structured variant for Merlin Control's directory browser — returns machine
    // -readable rows (with refs + tunnel hrefs) in `data`, not just prose.
    const r = listBrowsableFiles({
      query: typeof cmdArgs.query === 'string' ? cmdArgs.query : undefined,
      dir: typeof cmdArgs.dir === 'string' ? cmdArgs.dir : undefined,
    })
    const text = r.ok
      ? `Listed ${r.count} shared file(s) across ${r.roots.join(', ') || 'no roots'}.`
      : `Could not list files: ${r.error}.`
    return { text, data: r }
  }
  if (tool === 'snap_camera') {
    // Sentinel skill: grab a frame from a local camera OR an on-screen window
    // (e.g. a Bluestacks/IP-cam viewer) + submit it to the endeavor.
    const { captureFrame } = await import('./camera')
    const device = typeof cmdArgs.device === 'string' ? cmdArgs.device : getSettings().cameraDevice || undefined
    const window = typeof cmdArgs.window === 'string' ? cmdArgs.window : undefined
    const snap = await captureFrame({ device, window })
    if (!snap.ok || !snap.buffer) return { text: `Could not snap: ${snap.error || 'unknown error'}.` }
    const up = await submitSnapshot(snap.buffer, snap.filename!, snap.mimetype!, `Snapshot from ${snap.device}`)
    if (!up.ok) return { text: `Snapped "${snap.device}" but submit failed: ${up.error}.` }
    return { text: `📸 Snapshot from "${snap.device}" submitted to the endeavor: ${up.url}` }
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

  // Delivery guarantee: only advance the cursor past a command once its result is
  // ACKED (posted ok) — or dead-lettered after MAX_POST_ATTEMPTS. A failed post HALTS
  // cursor advance so the command is re-polled + retried next tick (no silent drop),
  // and the attempt cap keeps a poison message from wedging the queue forever.
  let newest = s.busCursor
  let handled = 0
  let halt = false
  for (const m of messages) {
    if (halt) break
    const meta = m.metadata
    const isCmd = Boolean(meta && meta.kind === 'node-command' && meta.tool)
    // Non-command messages (results, others) never block the cursor.
    if (!meta || !isCmd) {
      if (m.createdAt && m.createdAt > newest) newest = m.createdAt
      continue
    }
    const tool = meta.tool as string
    const requestId = meta.requestId || ''
    if (requestId && processed.has(requestId)) {
      if (m.createdAt && m.createdAt > newest) newest = m.createdAt
      continue
    }

    const { text, data } = await runCommand(tool, meta.args || {})
    // Core's /api/chat/send DROPS metadata (only text persists), so structured
    // skills (list_files) embed their JSON payload in the message text behind a
    // sentinel + the requestId. Core's node-files handler greps it back out.
    const payloadBlock =
      data !== undefined ? `\n\n${RESULT_SENTINEL}:${requestId}:${JSON.stringify(data)}` : ''
    const reply = `${text}${requestId ? `\n\n_(request ${requestId})_` : ''}${payloadBlock}`
    let posted = false
    try {
      const post = await coreFetch(s.boundAngelsUrl, '/api/chat/send', s.nodeToken, {
        // content MUST be the {text} shape — Core's Messages.content is a required
        // JSON field that rejects a bare string ("field is invalid: Content" → 500).
        method: 'POST',
        body: JSON.stringify({ space: s.busSpaceId, channel: s.busChannel, content: { text: reply }, messageType: 'system' }),
      })
      posted = post.ok
      if (!post.ok) appendLog({ type: 'error', source: 'node-bus', message: `result post ${post.status} for ${tool}` })
    } catch (e) {
      appendLog({ type: 'error', source: 'node-bus', message: `result post failed: ${e instanceof Error ? e.message : e}` })
    }

    if (posted) {
      if (requestId) { processed.add(requestId); attempts.delete(requestId) }
      if (m.createdAt && m.createdAt > newest) newest = m.createdAt
      handled++
      appendLog({ type: 'angels', source: 'node-bus', message: `answered ${tool} on #${s.busChannel}` })
    } else {
      const n = (requestId ? attempts.get(requestId) || 0 : 0) + 1
      if (requestId) attempts.set(requestId, n)
      if (n >= MAX_POST_ATTEMPTS) {
        // Dead-letter: stop retrying so it can't wedge the queue.
        if (requestId) { processed.add(requestId); attempts.delete(requestId) }
        if (m.createdAt && m.createdAt > newest) newest = m.createdAt
        appendLog({ type: 'error', source: 'node-bus', message: `dead-letter ${tool} after ${n} attempts (req ${requestId || 'n/a'})` })
      } else {
        // Hold the cursor here → re-poll + retry from this command next tick.
        appendLog({ type: 'system', source: 'node-bus', message: `holding for retry ${n}/${MAX_POST_ATTEMPTS}: ${tool} (req ${requestId || 'n/a'})` })
        halt = true
      }
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

// Zero-click preconfig: a "dropped" Merlin auto-locks onto the endeavor named in env
// and starts sharing its preset — no /connect click. MERLIN_ANGELS_URL falls back to
// NEXT_PUBLIC_ANGELS_URL so an image only needs to set MERLIN_ENDEAVOR.
const PRECONFIG_ENDEAVOR = (process.env.MERLIN_ENDEAVOR || '').trim()
const PRECONFIG_ANGELS_URL = (process.env.MERLIN_ANGELS_URL || process.env.NEXT_PUBLIC_ANGELS_URL || '').trim()

/** Start the heartbeat + poll loop once. No-op until the node is bound to an endeavor. */
export function startNodeBusLoop(): void {
  if (globalThis.__merlinNodeBusLoop) return
  globalThis.__merlinNodeBusLoop = {}

  // Start the Witness Engine (perception loop) and React Engine (autonomic responses).
  void import('@/lib/witness-engine').then(({ startEngine }) => startEngine()).catch(() => {})
  void import('@/lib/react-engine').then(({ startReactEngine }) => startReactEngine()).catch(() => {})

  // Start the Events WebSocket server for real-time signal push to local subscribers.
  void import('@/lib/events-server').then(({ startEventsServer }) => startEventsServer()).catch(() => {})

  const heartbeat = async () => {
    const bound = Boolean(getSettings().boundEndeavor)
    // If not yet bound but env preconfigures an endeavor, auto-lock-on this tick.
    const args =
      !bound && PRECONFIG_ENDEAVOR
        ? { endeavor: PRECONFIG_ENDEAVOR, angelsUrl: PRECONFIG_ANGELS_URL || undefined }
        : {}
    if (!bound && !PRECONFIG_ENDEAVOR) return // unbound + no preconfig → nothing to do
    // Ensure Ollama is detected + running before registering compute capabilities.
    void autoProvisionOllama().catch(() => {})
    try {
      const r = await registerNode(args)
      if (r.ok && !bound) {
        appendLog({ type: 'angels', source: 'node-bus', message: `auto-locked onto "${PRECONFIG_ENDEAVOR}" (env preconfig)` })
      } else if (!r.ok) {
        appendLog({ type: 'error', source: 'node-bus', message: `heartbeat register ${r.status}: ${r.core.error || ''}` })
      }
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
