/**
 * Payload proxy route — lets client code call /api/payload/<collection>
 * and get the fetch-with-cache-fallback pattern for free.
 */
import { NextRequest, NextResponse } from 'next/server'
import { payloadFetch } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const search = req.nextUrl.search
  const fullPath = `/api/${path.join('/')}${search}`
  const result = await payloadFetch(fullPath)
  return NextResponse.json(result)
}
