import { NextRequest, NextResponse } from 'next/server'
import { getLog, appendLog } from '@/lib/store'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '100')
  const type = searchParams.get('type') || undefined
  const entries = getLog(limit, type)
  return NextResponse.json({ entries, count: entries.length })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as any
  const entry = appendLog({ type: body.type || 'info', source: body.source || 'manual', message: body.message, metadata: body.metadata })
  return NextResponse.json(entry)
}
