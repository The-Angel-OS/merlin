import { NextRequest, NextResponse } from 'next/server'
import {
  loadShares,
  saveShares,
  isEnvLocked,
  SHARE_PRESETS,
  PRESET_BLURBS,
  type ShareFlags,
} from '@/lib/shares'
import { loadRoots } from '@/lib/media-roots'
import { getSettings, appendLog } from '@/lib/store'
import { reconcileTunnel, tunnelStatus } from '@/lib/tunnel'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

const FLAG_KEYS: (keyof ShareFlags)[] = [
  'stats', 'media', 'cameras', 'ingest', 'leo', 'compute', 'retrieval', 'tunnel',
]

async function ollamaAvailable(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 500)
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok
  } catch {
    return false
  }
}

export async function GET() {
  const config = loadShares()
  const hasSharedRoots = loadRoots().roots.some((r) => r.shared)
  const availability = {
    hasSharedRoots,
    tunnelConfigured: Boolean(getSettings().tunnelUrl),
    ollamaAvailable: await ollamaAvailable(),
  }
  const presets = Object.keys(SHARE_PRESETS).map((name) => ({ name, blurb: PRESET_BLURBS[name] || '' }))
  return NextResponse.json({ config, availability, presets, envLocked: isEnvLocked(), tunnel: tunnelStatus() })
}

export async function POST(req: NextRequest) {
  if (isEnvLocked()) {
    return NextResponse.json(
      { error: 'Sharing is locked by MERLIN_PROFILE / MERLIN_SHARES_JSON env preconfig.' },
      { status: 409 },
    )
  }
  const body = (await req.json()) as { profile?: string; shares?: Partial<ShareFlags> }

  // Apply a named preset wholesale…
  if (body.profile && SHARE_PRESETS[body.profile]) {
    const next = { profile: body.profile, shares: { ...SHARE_PRESETS[body.profile] } }
    saveShares(next)
    // The tunnel share owns the cloudflared process — start/stop it to match.
    reconcileTunnel(next.shares.tunnel)
    appendLog({ type: 'system', source: 'shares', message: `Applied sharing preset: ${body.profile}` })
    return NextResponse.json({ success: true, config: next, tunnel: tunnelStatus() })
  }

  // …or merge individual flag edits (→ profile becomes 'custom').
  if (body.shares && typeof body.shares === 'object') {
    const current = loadShares()
    const merged = { ...current.shares }
    for (const k of FLAG_KEYS) {
      if (typeof body.shares[k] === 'boolean') merged[k] = body.shares[k] as boolean
    }
    const next = { profile: 'custom', shares: merged }
    saveShares(next)
    // If the tunnel flag was touched, start/stop cloudflared to match.
    if (typeof body.shares.tunnel === 'boolean') reconcileTunnel(merged.tunnel)
    appendLog({
      type: 'system',
      source: 'shares',
      message: `Sharing updated: ${FLAG_KEYS.filter((k) => merged[k]).join(', ') || 'presence only'}`,
    })
    return NextResponse.json({ success: true, config: next, tunnel: tunnelStatus() })
  }

  return NextResponse.json({ error: 'Provide { profile } or { shares }.' }, { status: 400 })
}
