import { NextRequest, NextResponse } from 'next/server'
import { getMasterDescription, setMasterDescription } from '@/lib/template'

export async function GET() {
  return NextResponse.json({ description: getMasterDescription() })
}

export async function POST(req: NextRequest) {
  const { description } = await req.json() as { description: string }
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })
  setMasterDescription(description)
  return NextResponse.json({ success: true })
}
