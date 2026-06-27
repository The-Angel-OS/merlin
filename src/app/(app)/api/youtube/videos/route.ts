import { NextResponse } from 'next/server'
import { fetchVideos } from '@/lib/youtube'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const force = searchParams.get('refresh') === '1'
  const videos = await fetchVideos(50, force)
  return NextResponse.json({ videos, count: videos.length })
}
