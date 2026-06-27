import { NextResponse } from 'next/server'
import { fetchChannelStats } from '@/lib/youtube'

export async function GET() {
  const stats = await fetchChannelStats()
  if (!stats) return NextResponse.json({ error: 'YouTube API not configured or request failed' }, { status: 503 })
  return NextResponse.json(stats)
}
