/**
 * Proxy snapshot from IP camera.
 * Handles auth (Basic) transparently so browser doesn't get 401 cross-origin.
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

  const url = `http://${camera.ip}:${camera.port}${camera.snapshotPath}`
  const headers: Record<string, string> = {}
  if (camera.username) {
    headers['Authorization'] =
      'Basic ' + Buffer.from(`${camera.username}:${camera.password || ''}`).toString('base64')
  }

  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
    if (!resp.ok) {
      return NextResponse.json({ error: `Camera returned ${resp.status}` }, { status: 502 })
    }
    const blob = await resp.blob()
    return new NextResponse(blob.stream(), {
      headers: {
        'Content-Type': resp.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'no-cache, no-store',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unreachable'
    return NextResponse.json({ error: `Camera unreachable: ${msg}` }, { status: 504 })
  }
}
