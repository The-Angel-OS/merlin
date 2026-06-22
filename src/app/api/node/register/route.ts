import { NextResponse } from 'next/server'
import { registerNode, startNodeBusLoop } from '@/lib/node-bus'
import { getSettings } from '@/lib/store'

/**
 * GET /api/node/register — current bus binding for this node (is it locked on?).
 * Never returns the token itself — only whether one is held + its expiry.
 */
export async function GET() {
  startNodeBusLoop() // idempotent — start the heartbeat/poll loop on first touch (nodejs runtime)
  const s = getSettings()
  return NextResponse.json({
    boundEndeavor: s.boundEndeavor || '',
    boundAngelsUrl: s.boundAngelsUrl || '',
    busChannel: s.busChannel || '',
    busSpaceId: s.busSpaceId || '',
    hasToken: Boolean(s.nodeToken),
    nodeTokenExpiresAt: s.nodeTokenExpiresAt || '',
  })
}

/**
 * POST /api/node/register — lock this node onto an endeavor + register UP to Core.
 *
 * Delegates to registerNode(), which pushes the catalog to Core's
 * /api/node-ops/register, then PERSISTS the bus binding Core returns (channel, AI Bus
 * space, freshly-minted node token) so the heartbeat + poll loop can run autonomously.
 *
 * Body: { endeavor, angelsUrl?, key? } — angelsUrl/key fall back to
 * NEXT_PUBLIC_ANGELS_URL / NODE_REGISTER_KEY env.
 * @see docs/strategy/DISTRIBUTED_NODES_ADOPTION.md + Core docs/architecture/NODE_BUS_COMMS.md
 */
export async function POST(req: Request) {
  let body: { endeavor?: string; angelsUrl?: string; key?: string } = {}
  try { body = await req.json() } catch { /* defaults below */ }

  const endeavor = (body.endeavor || '').trim()
  if (!endeavor) return NextResponse.json({ error: 'endeavor is required' }, { status: 400 })

  try {
    startNodeBusLoop() // ensure the heartbeat/poll loop is running once a node locks on
    const r = await registerNode({ endeavor, angelsUrl: body.angelsUrl, key: body.key })
    if (!r.ok) return NextResponse.json({ error: `core ${r.status}`, detail: r.core }, { status: r.status === 400 ? 400 : 502 })
    return NextResponse.json({ ok: true, endeavor, channel: r.core.channel, core: r.core })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'registration failed' }, { status: 502 })
  }
}
