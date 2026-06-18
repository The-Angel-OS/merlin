import os from 'node:os'
import { loadRoots } from '@/lib/media-roots'

/**
 * buildNodeCatalog — what this Merlin node offers the federation: opt-in shared
 * drives + lendable local Ollama models (compute) + host identity. Single source of
 * truth for /api/node/catalog (read) and /api/node/register (push UP to the endeavor).
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

export async function buildNodeCatalog() {
  // Shared UP = explicitly shared roots only (NOT just locally-enabled). A node with
  // thousands of local files publishes only what its owner opted to share.
  const shared = loadRoots().roots
    .filter((r) => r.shared)
    .map((r) => ({ path: r.path, label: r.label, icon: r.icon }))

  const ollama = await probeOllama()

  const capabilities = [
    ...(shared.length ? ['media'] : []),
    'ingest',
    'cameras',
    ...(ollama.available ? ['compute'] : []),
  ]

  return {
    hostname: os.hostname(),
    localIp: localIPv4(),
    platform: os.platform(),
    uptimeSec: Math.round(os.uptime()),
    capabilities,
    drives: shared,
    compute: ollama,
    version: '2.0.0',
  }
}
