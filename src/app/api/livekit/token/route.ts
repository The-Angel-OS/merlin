/**
 * LiveKit token generator.
 * Requires livekit-server-sdk: pnpm add livekit-server-sdk
 * Returns a JWT token the client uses to join a room.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getLiveKitConfig } from '@/lib/store'

export async function POST(req: NextRequest) {
  const { roomName, participantName } = await req.json()
  if (!roomName || !participantName) {
    return NextResponse.json({ error: 'roomName and participantName required' }, { status: 400 })
  }

  const cfg = getLiveKitConfig()
  if (!cfg.apiKey || !cfg.apiSecret) {
    return NextResponse.json(
      { error: 'LiveKit not configured. Add apiKey + apiSecret in Settings → Keys.' },
      { status: 503 },
    )
  }

  try {
    // Dynamic import so the app boots even without livekit-server-sdk installed
    const { AccessToken } = await import('livekit-server-sdk')
    const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
      identity: participantName,
      ttl: '2h',
    })
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
    const jwt = await token.toJwt()
    return NextResponse.json({ token: jwt, serverUrl: cfg.serverUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Token generation failed: ${msg}` }, { status: 500 })
  }
}
