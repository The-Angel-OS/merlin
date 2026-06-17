import { NextRequest, NextResponse } from 'next/server'
import { loadRoots, saveRoots, type MediaRootsConfig } from '@/lib/media-roots'

export async function GET() {
  return NextResponse.json(loadRoots())
}

export async function PUT(request: NextRequest) {
  try {
    const body: MediaRootsConfig = await request.json()
    if (!body.roots || !Array.isArray(body.roots)) {
      return NextResponse.json({ error: 'Invalid config' }, { status: 400 })
    }
    saveRoots(body)
    return NextResponse.json({ ok: true, config: loadRoots() })
  } catch (error) {
    console.error('Save roots error:', error)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
