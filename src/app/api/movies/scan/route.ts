import { NextResponse } from 'next/server'
import { scanForMediaDirs } from '@/lib/media-roots'

export async function GET() {
  try {
    const dirs = await scanForMediaDirs()
    return NextResponse.json({ dirs })
  } catch (error) {
    console.error('Scan error:', error)
    return NextResponse.json({ error: 'Scan failed', dirs: [] }, { status: 500 })
  }
}
