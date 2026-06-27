import { NextRequest, NextResponse } from 'next/server'
import { updateVideoDescription } from '@/lib/youtube'

export async function POST(req: NextRequest) {
  const { videoId, title, description } = await req.json() as { videoId: string; title: string; description: string }
  if (!videoId || !title || !description) return NextResponse.json({ error: 'videoId, title, description required' }, { status: 400 })

  const ok = await updateVideoDescription(videoId, title, description)
  if (!ok) return NextResponse.json({ error: 'Update failed — check OAuth2 config in Settings' }, { status: 500 })
  return NextResponse.json({ success: true, videoId })
}
