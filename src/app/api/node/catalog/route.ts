import { NextResponse } from 'next/server'
import { buildNodeCatalog } from '@/lib/node-catalog'

/**
 * GET /api/node/catalog — what this Merlin node offers the federation (shared drives +
 * lendable Ollama compute + host identity). Read-only; the payload that flows UP on
 * registration. @see src/lib/node-catalog.ts
 */
export async function GET() {
  return NextResponse.json({ ok: true, node: await buildNodeCatalog() })
}
