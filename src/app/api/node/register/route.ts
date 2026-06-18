import { NextResponse } from 'next/server'
import { buildNodeCatalog } from '@/lib/node-catalog'

/**
 * POST /api/node/register — register this node UP to its endeavor on Angel OS Core.
 *
 * Gathers the node catalog and pushes it to Core's /api/node-ops/register so the
 * endeavor can SEE this Merlin (Phase 1 — "see it"). Outbound-only, no NAT needed.
 *
 * Body: { endeavor, angelsUrl?, key? } — angelsUrl/key fall back to
 * NEXT_PUBLIC_ANGELS_URL / NODE_REGISTER_KEY env.
 * @see docs/strategy/DISTRIBUTED_NODES_ADOPTION.md
 */
export async function POST(req: Request) {
  let body: { endeavor?: string; angelsUrl?: string; key?: string } = {}
  try { body = await req.json() } catch { /* defaults below */ }

  const endeavor = (body.endeavor || '').trim()
  const angelsUrl = (body.angelsUrl || process.env.NEXT_PUBLIC_ANGELS_URL || '').replace(/\/$/, '')
  const key = body.key || process.env.NODE_REGISTER_KEY || ''
  if (!endeavor) return NextResponse.json({ error: 'endeavor is required' }, { status: 400 })
  if (!angelsUrl) return NextResponse.json({ error: 'angelsUrl (or NEXT_PUBLIC_ANGELS_URL) required' }, { status: 400 })

  const catalog = await buildNodeCatalog()
  // Core dedups on node.id|node.hostname — surface hostname at the top.
  const node = { id: catalog.hostname, ...catalog }

  try {
    const res = await fetch(`${angelsUrl}/api/node-ops/register${key ? `?key=${encodeURIComponent(key)}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endeavor, node }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: `core ${res.status}`, detail: data }, { status: 502 })
    return NextResponse.json({ ok: true, registeredTo: angelsUrl, endeavor, core: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'registration failed' }, { status: 502 })
  }
}
