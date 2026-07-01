import { NextResponse } from 'next/server'
import { eventsServerStatus } from '@/lib/events-server'
import { engineStatus } from '@/lib/witness-engine'

export async function GET() {
  const events = eventsServerStatus()
  const witness = engineStatus()
  return NextResponse.json({
    ok: true,
    events,
    witness: { subscriberCount: witness.subscriberCount, eyeCount: witness.eyeCount },
  })
}
