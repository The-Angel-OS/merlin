import { NextRequest, NextResponse } from 'next/server'
import { getCameras, upsertCamera, deleteCamera, Camera } from '@/lib/store'

export async function GET() {
  return NextResponse.json({ cameras: getCameras() })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Partial<Camera>
  if (!body.name || !body.ip) {
    return NextResponse.json({ error: 'name and ip are required' }, { status: 400 })
  }
  const camera = upsertCamera({
    name: body.name,
    location: body.location || '',
    ip: body.ip,
    port: body.port || 80,
    username: body.username,
    password: body.password,
    mjpegPath: body.mjpegPath || '/video',
    snapshotPath: body.snapshotPath || '/snapshot',
    rtspUrl: body.rtspUrl,
    hlsUrl: body.hlsUrl,
    enabled: body.enabled !== false,
    protocol: body.protocol || 'http',
  })
  return NextResponse.json({ camera })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteCamera(id)
  return NextResponse.json({ ok: true })
}
