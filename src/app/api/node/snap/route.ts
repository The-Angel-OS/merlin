import { NextResponse } from 'next/server'
import { listCameras, snapCamera } from '@/lib/camera'
import { submitSnapshot } from '@/lib/node-bus'
import { getSettings } from '@/lib/store'

export const runtime = 'nodejs'

/**
 * GET  /api/node/snap — list local camera devices (for picking a default).
 * POST /api/node/snap — snap a frame + submit it to the bound endeavor's Media.
 *
 * The sentinel trigger. Key-gated like /api/node/skill (NODE_SKILL_KEY → NODE_REGISTER_KEY):
 * a camera grab is sensitive, so the surface stays closed unless a key is configured
 * and presented. Body: { device?: string, key?: string }.
 */
export async function GET() {
  const list = await listCameras()
  const def = getSettings().cameraDevice || ''
  return NextResponse.json({ ...list, default: def })
}

export async function POST(req: Request) {
  let body: { device?: string; key?: string } = {}
  try { body = await req.json() } catch { /* defaults */ }

  const configured = process.env.NODE_SKILL_KEY || process.env.NODE_REGISTER_KEY || ''
  if (!configured) {
    return NextResponse.json({ error: 'node skill surface disabled (no NODE_SKILL_KEY)' }, { status: 403 })
  }
  const presented = body.key || req.headers.get('x-node-key') || ''
  if (presented !== configured) {
    return NextResponse.json({ error: 'invalid or missing node key' }, { status: 403 })
  }

  const device = typeof body.device === 'string' && body.device.trim() ? body.device.trim() : getSettings().cameraDevice || undefined
  const snap = await snapCamera(device)
  if (!snap.ok || !snap.buffer) {
    return NextResponse.json({ ok: false, error: snap.error || 'snap failed' }, { status: 400 })
  }
  const up = await submitSnapshot(snap.buffer, snap.filename!, snap.mimetype!, `Snapshot from ${snap.device}`)
  if (!up.ok) {
    return NextResponse.json({ ok: false, device: snap.device, error: up.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, device: snap.device, url: up.url, filename: snap.filename })
}
