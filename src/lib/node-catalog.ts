import os from 'node:os'
import { loadRoots } from '@/lib/media-roots'
import { getSettings } from '@/lib/store'
import { loadShares, deriveCapabilities } from '@/lib/shares'

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

/** Live CPU utilization %, sampled over a short window (os.loadavg is 0 on Windows). */
async function cpuUsagePercent(sampleMs = 150): Promise<number> {
  const snap = () => {
    let idle = 0
    let total = 0
    for (const c of os.cpus()) {
      for (const t of Object.values(c.times)) total += t
      idle += c.times.idle
    }
    return { idle, total }
  }
  const a = snap()
  await new Promise((r) => setTimeout(r, sampleMs))
  const b = snap()
  const idle = b.idle - a.idle
  const total = b.total - a.total
  return total > 0 ? Math.round((1 - idle / total) * 100) : 0
}

// ── High-res CPU sampler ─────────────────────────────────────────────────────
// A low-overhead ring buffer sampled every 2s so telemetry carries a *time series*
// (sparkline), not just a 2-min snapshot. Started on first catalog build; idempotent.
const CPU_RING: number[] = []
const CPU_RING_MAX = 60 // ~2 min at 2s
let cpuSamplerStarted = false
function startCpuSampler() {
  if (cpuSamplerStarted) return
  cpuSamplerStarted = true
  const tick = async () => {
    try {
      const pct = await cpuUsagePercent(120)
      CPU_RING.push(pct)
      while (CPU_RING.length > CPU_RING_MAX) CPU_RING.shift()
    } catch {
      /* sampler is best-effort */
    }
  }
  void tick()
  setInterval(() => void tick(), 2000)
}

function humanUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return [d ? `${d}d` : '', h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ')
}

/**
 * nodeStats — live machine telemetry, beamed UP every heartbeat (the DataDog-replacement
 * payload). Read-only; rendered by MerlinControl's Stats tab + the get_node_stats LEO tool.
 */
async function nodeStats(): Promise<Record<string, unknown>> {
  startCpuSampler()
  const cpus = os.cpus()
  const total = os.totalmem()
  const free = os.freemem()
  const current = await cpuUsagePercent()
  // Snapshot the ring (newest first sample lives at the end); fall back to the spot read.
  const cpu_series = CPU_RING.length ? [...CPU_RING] : [current]
  return {
    cpu_pct: current,
    cpu_series,
    cpu_cores: cpus.length,
    cpu_model: (cpus[0]?.model || 'unknown').trim(),
    mem_used_pct: Math.round((1 - free / total) * 100),
    mem_total_gb: +(total / 1e9).toFixed(1),
    mem_free_gb: +(free / 1e9).toFixed(1),
    uptime: humanUptime(os.uptime()),
    platform: `${os.platform()} ${os.arch()}`,
  }
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

  // What this owner OPTED to share (tiered toggles / named preset / env preconfig).
  // Intent is ANDed with availability: a flag says "willing", these checks say "able".
  const { shares } = loadShares()
  const capabilities = deriveCapabilities(shares, {
    hasSharedRoots: shared.length > 0,
    ollamaAvailable: ollama.available,
  })

  // Bulk/streaming reach (movies, cameras, big files) rides the tunnel; command/control
  // rides the bus. Advertise the tunnel URL only when tunnel sharing is on. The URL comes
  // from settings (set at runtime) or MERLIN_TUNNEL_URL env (preconfig, e.g. a named tunnel).
  const tunnelUrl = shares.tunnel
    ? getSettings().tunnelUrl || process.env.MERLIN_TUNNEL_URL || undefined
    : undefined

  const stats = await nodeStats()

  // Active witnesses (eyes) are advertised in the heartbeat so the federation
  // knows what this node is perceiving. Dynamic import avoids circular deps.
  let witnesses: Array<{ id: string; type: string; label: string; status: string; lastSignalAt?: string }> = []
  try {
    const { activeWitnesses } = await import('@/lib/witness-engine')
    witnesses = activeWitnesses()
  } catch { /* witness engine not yet loaded */ }

  return {
    hostname: os.hostname(),
    localIp: localIPv4(),
    platform: os.platform(),
    uptimeSec: Math.round(os.uptime()),
    capabilities,
    drives: shared,
    compute: ollama,
    stats,
    tunnelUrl,
    witnesses,
    version: '2.0.0',
  }
}
