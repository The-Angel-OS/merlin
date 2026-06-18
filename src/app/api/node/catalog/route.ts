import { NextResponse } from 'next/server'
import os from 'node:os'
import { loadRoots } from '@/lib/media-roots'

/**
 * GET /api/node/catalog — what this Merlin node offers the federation.
 *
 * The first brick of the control plane: a node declares what it can SHARE
 * (opt-in drives only — `enabled` roots) and what it can LEND (local Ollama
 * models = compute). This is the payload a Merlin publishes UP to its endeavor
 * so Angel OS Core + Nimue can see and (later) control it. Read-only, no NAT
 * needed — it flows outbound on registration.
 *
 * @see memory: Merlin = Angel OS's boots on the ground; control plane slice (a).
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

function localIPv4(): string | null {
  // Prefer a real LAN address; skip internal + link-local (169.254 APIPA).
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) return i.address
    }
  }
  return null
}

/** Probe a local Ollama for the models this node can lend. Fail-soft + fast. */
async function probeOllama(): Promise<{ available: boolean; models: string[] }> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 700)
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return { available: false, models: [] }
    const data = (await res.json()) as { models?: Array<{ name?: string }> }
    const models = (data.models || []).map((m) => m.name).filter((n): n is string => Boolean(n))
    return { available: true, models }
  } catch {
    return { available: false, models: [] }
  }
}

export async function GET() {
  // Shared drives = the OPT-IN set (enabled roots). A node serves nothing it
  // hasn't explicitly chosen to share.
  const shared = loadRoots().roots
    .filter((r) => r.enabled)
    .map((r) => ({ path: r.path, label: r.label, icon: r.icon }))

  const ollama = await probeOllama()

  const capabilities = [
    ...(shared.length ? ['media'] : []),
    'ingest',
    'cameras',
    ...(ollama.available ? ['compute'] : []),
  ]

  return NextResponse.json({
    ok: true,
    node: {
      hostname: os.hostname(),
      localIp: localIPv4(),
      platform: os.platform(),
      uptimeSec: Math.round(os.uptime()),
    },
    // ponytail: endeavor association is client-held today (tenant picker) — the
    // registration call carries it; the node itself stays endeavor-agnostic here.
    capabilities,
    drives: shared,
    compute: ollama,
    version: '2.0.0',
  })
}
