import { NextResponse } from 'next/server'
import { listCameras, listWindows, captureFrame } from '@/lib/camera'
import { submitSnapshot } from '@/lib/node-bus'
import { getSettings } from '@/lib/store'

export const runtime = 'nodejs'

/**
 * GET  /api/node/snap — list capture sources: camera devices + open windows.
 * POST /api/node/snap — snap a frame (camera OR window) + submit to endeavor Media.
 *
 * The sentinel trigger. Key-gated like /api/node/skill (NODE_SKILL_KEY → NODE_REGISTER_KEY):
 * a screen/camera grab is sensitive, so the surface stays closed unless a key is
 * configured and presented. Body: { device?, window?, key? }. `window` wins.
 */
export async function GET() {
  const [cams, wins] = await Promise.all([listCameras(), listWindows()])
  const def = getSettings().cameraDevice || ''
  return NextResponse.json({ ok: true, cameras: cams.cameras, windows: wins.windows, default: def })
}

export async function POST(req: Request) {
  let body: { device?: string; window?: string; key?: string } = {}
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
  const window = typeof body.window === 'string' && body.window.trim() ? body.window.trim() : undefined
  const snap = await captureFrame({ device, window })
  if (!snap.ok || !snap.buffer) {
    return NextResponse.json({ ok: false, error: snap.error || 'snap failed' }, { status: 400 })
  }
  const up = await submitSnapshot(snap.buffer, snap.filename!, snap.mimetype!, `Snapshot from ${snap.device}`)
  if (!up.ok) {
    return NextResponse.json({ ok: false, device: snap.device, error: up.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, device: snap.device, url: up.url, filename: snap.filename })
}
