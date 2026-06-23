import { NextResponse } from 'next/server'
import { startSentinel, stopSentinel, sentinelStatus } from '@/lib/sentinel'
import { updateSettings } from '@/lib/store'

export const runtime = 'nodejs'

/**
 * GET  /api/node/sentinel — current sentinel status (running, device, last tick).
 * POST /api/node/sentinel — start/stop the change-detection sentinel.
 *
 * Key-gated like the other node skills (a camera loop is sensitive). Body:
 * { action?: 'start' | 'stop', device?, intervalMs?, threshold?, key? }.
 */
export async function GET() {
  return NextResponse.json(sentinelStatus())
}

export async function POST(req: Request) {
  let body: { action?: string; device?: string; intervalMs?: number; threshold?: number; key?: string } = {}
  try { body = await req.json() } catch { /* defaults */ }

  const configured = process.env.NODE_SKILL_KEY || process.env.NODE_REGISTER_KEY || ''
  if (!configured) {
    return NextResponse.json({ error: 'node skill surface disabled (no NODE_SKILL_KEY)' }, { status: 403 })
  }
  const presented = body.key || req.headers.get('x-node-key') || ''
  if (presented !== configured) {
    return NextResponse.json({ error: 'invalid or missing node key' }, { status: 403 })
  }

  // Apply any provided config before (re)starting.
  const patch: Record<string, unknown> = {}
  if (typeof body.device === 'string') patch.sentinelDevice = body.device.trim()
  if (typeof body.intervalMs === 'number' && body.intervalMs >= 1000) patch.sentinelIntervalMs = body.intervalMs
  if (typeof body.threshold === 'number' && body.threshold > 0 && body.threshold <= 1) patch.sentinelThreshold = body.threshold
  if (Object.keys(patch).length) updateSettings(patch)

  if (body.action === 'stop') return NextResponse.json(stopSentinel())
  return NextResponse.json({ ...startSentinel(), ...sentinelStatus() })
}
