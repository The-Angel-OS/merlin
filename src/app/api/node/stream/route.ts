import { NextResponse } from 'next/server'
import { readNodeStream, startNodeBusLoop } from '@/lib/node-bus'

/**
 * GET /api/node/stream — recent messages on this node's bus channel, for the LEO
 * comm-stream inspector. Read-only; does not advance the poll cursor.
 */
export async function GET() {
  startNodeBusLoop() // ensure the loop is alive (idempotent)
  const r = await readNodeStream(40)
  return NextResponse.json(r)
}
