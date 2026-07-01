import os from 'node:os'
import { registerProducer, registerEye, activeWitnesses } from '../witness-engine'
import { getSettings } from '../store'
import type { EyeConfig, Signal, EyeState } from '../witness-types'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

let lastCpuIdle = 0
let lastCpuTotal = 0
let lastSampleAt = 0

function cpuPercent(): number {
  const snap = () => {
    let idle = 0, total = 0
    for (const c of os.cpus()) {
      for (const t of Object.values(c.times)) total += t
      idle += c.times.idle
    }
    return { idle, total }
  }
  const now = snap()
  if (!lastSampleAt) { lastCpuIdle = now.idle; lastCpuTotal = now.total; lastSampleAt = Date.now(); return 0 }
  const idle = now.idle - lastCpuIdle
  const total = now.total - lastCpuTotal
  lastCpuIdle = now.idle
  lastCpuTotal = now.total
  lastSampleAt = Date.now()
  return total > 0 ? Math.round((1 - idle / total) * 100) : 0
}

let lastOllamaOk = false
let lastOllamaChecked = 0

async function checkOllama(): Promise<boolean> {
  const now = Date.now()
  if (now - lastOllamaChecked < 30_000) return lastOllamaOk
  lastOllamaChecked = now
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2_000) })
    lastOllamaOk = res.ok
    return res.ok
  } catch { lastOllamaOk = false; return false }
}

async function systemHealthProducer(eye: EyeState): Promise<Signal | null> {
  const total = os.totalmem()
  const free = os.freemem()
  const memPercent = Math.round((1 - free / total) * 100)
  const cpu = cpuPercent()
  const ollama = await checkOllama()
  const witnesses = activeWitnesses()
  const errorEyes = witnesses.filter((w) => w.status === 'error').length

  const tunnelUrl = getSettings().tunnelUrl || process.env.MERLIN_TUNNEL_URL
  const location = eye.config.location

  return {
    id: `health:${Date.now()}`,
    eyeId: eye.config.id,
    eyeType: 'system_health',
    type: 'system_health',
    confidence: 1,
    summary: `CPU ${cpu}% · RAM ${memPercent}% · ${witnesses.length} eyes (${errorEyes} err) · Ollama ${ollama ? 'ok' : 'down'}`,
    timestamp: new Date().toISOString(),
    location,
    metadata: {
      cpuPercent: cpu,
      memoryPercent: memPercent,
      memoryFreeGb: +(free / 1e9).toFixed(1),
      uptimeSec: Math.round(os.uptime()),
      ollamaAvailable: ollama,
      activeEyes: witnesses.length,
      errorEyes,
      tunnelUrl: tunnelUrl || undefined,
    },
  }
}

export function enableSystemHealthEye(config?: Partial<EyeConfig>): void {
  registerProducer('system_health', systemHealthProducer)
  registerEye({
    id: 'system-health',
    type: 'system_health',
    label: 'System Health',
    enabled: true,
    intervalMs: config?.intervalMs ?? 30_000,
    location: config?.location,
  })
}
