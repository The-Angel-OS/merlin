/**
 * MJPEG stream proxy — pipes camera's multipart/x-mixed-replace stream to browser.
 * Handles Basic auth so credentials never leave the server.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCameras } from '@/lib/store'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const camera = getCameras().find(c => c.id === id)
  if (!camera) return NextResponse.json({ error: 'Camera not found' }, { status: 404 })
  if (!camera.enabled) return NextResponse.json({ error: 'Camera disabled' }, { status: 403 })

  const url = `http://${camera.ip}:${camera.port}${camera.mjpegPath}`
  const headers: Record<string, string> = {}
  if (camera.username) {
    headers['Authorization'] =
      'Basic ' + Buffer.from(`${camera.username}:${camera.password || ''}`).toString('base64')
  }

  try {
    const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `Camera returned ${upstream.status}` }, { status: 502 })
    }
    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'multipart/x-mixed-replace;boundary=mjpeg',
        'Cache-Control': 'no-cache, no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unreachable'
    return NextResponse.json({ error: `Camera unreachable: ${msg}` }, { status: 504 })
  }
}
