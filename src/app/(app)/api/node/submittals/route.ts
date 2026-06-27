import { NextResponse } from 'next/server'
import { getSubmittals } from '@/lib/store'

export const runtime = 'nodejs'

/**
 * GET /api/node/submittals — this node's recent camera/window/sentinel submittals.
 * Local mirror of what was pushed to the endeavor's Media — powers Merlin's
 * Screenshots tab. URLs are relative to the bound endeavor (boundAngelsUrl).
 */
export async function GET() {
  const items = await getSubmittals(200)
  return NextResponse.json({ ok: true, items })
}
