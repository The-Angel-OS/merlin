import { NextRequest, NextResponse } from 'next/server'
import { checkAngelsStatus } from '@/lib/angels'

export async function GET(req: NextRequest) {
  const force = new URL(req.url).searchParams.get('force') === '1'
  const status = await checkAngelsStatus(force)
  return NextResponse.json(status)
}
