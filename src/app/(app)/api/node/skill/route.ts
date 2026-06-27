import { NextResponse } from 'next/server'
import { listSharedMedia } from '@/lib/nodeSkills'

/**
 * POST /api/node/skill — invoke a federation-exposed skill ON this node.
 *
 * The inbound counterpart to /api/node/register (which beams UP): a peer (LEO,
 * on behalf of an endeavor) asks this node to DO something — e.g. list files
 * matching a query — and gets a result scoped to the node's SHARED roots only.
 *
 * Two rails:
 *  1. AUTH — the caller must present the node key (NODE_SKILL_KEY, falling back to
 *     NODE_REGISTER_KEY). No key configured ⇒ the skill surface is closed (403),
 *     so a node never exposes skills by accident.
 *  2. CAPABILITY BOUNDARY — every skill is clamped to getSharedRoots() inside
 *     nodeSkills.ts; an authenticated caller still can't read outside the grant.
 *
 * Body: { skill: 'list_media', args?: {...}, key?: string }
 * Constitutional note: this is the path a forked Merlin also serves — the
 * shared-roots clamp is structural, not a setting, so the grant holds everywhere.
 */
export async function POST(req: Request) {
  let body: { skill?: string; args?: Record<string, unknown>; key?: string } = {}
  try { body = await req.json() } catch { /* defaults */ }

  const configured = process.env.NODE_SKILL_KEY || process.env.NODE_REGISTER_KEY || ''
  if (!configured) {
    return NextResponse.json({ error: 'node skill surface disabled (no NODE_SKILL_KEY)' }, { status: 403 })
  }
  const presented = body.key || req.headers.get('x-node-key') || ''
  if (presented !== configured) {
    return NextResponse.json({ error: 'invalid or missing node key' }, { status: 403 })
  }

  const skill = (body.skill || '').trim()
  const args = body.args || {}

  switch (skill) {
    case 'list_media': {
      const result = listSharedMedia({
        query: typeof args.query === 'string' ? args.query : undefined,
        dir: typeof args.dir === 'string' ? args.dir : undefined,
      })
      const status = result.ok ? 200 : 400
      return NextResponse.json({ skill, ...result }, { status })
    }
    default:
      return NextResponse.json({ error: `unknown skill '${skill}'`, available: ['list_media'] }, { status: 400 })
  }
}
