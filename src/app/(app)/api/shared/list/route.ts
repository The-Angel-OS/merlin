import { NextRequest } from 'next/server'
import { browseShared } from '@/lib/nodeSkills'

export const runtime = 'nodejs'

/**
 * GET /api/shared/list?ref=<rootLabel::relpath>
 *
 * One level of the shared tree — the data source for a real directory browser.
 * Sibling of /api/shared/file: same opaque refs, same access gate (browseShared
 * refuses anything outside a shared root), same tunnel-backed reachability.
 *
 * Merlin Control used to get this over the AI Bus — Core posted a command, this
 * node answered with a result message, Core polled for it. That round-trip is
 * why the UI was a flat dump: you cannot build folder navigation on an
 * eventually-consistent mailbox. Over the tunnel it is one request.
 */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref') || ''
  const result = browseShared(ref || undefined)
  return Response.json(result, { status: result.ok ? 200 : 404 })
}
