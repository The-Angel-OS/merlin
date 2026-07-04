import { appendLog, updateSettings, createIncident } from './store'
import { logNodeError } from './nodeError'
import { submitSnapshot } from './node-bus'
import { captureFrame } from './camera'
import { activeWitnesses } from './witness-engine'
import type { Signal } from './witness-types'

declare global {
  var __reactEngine:
    | {
        reflexes: Map<string, Reflex>
        throttle: Map<string, number>
        running: boolean
      }
    | undefined
}

function engine() {
  if (!globalThis.__reactEngine) {
    globalThis.__reactEngine = { reflexes: new Map(), throttle: new Map(), running: false }
  }
  return globalThis.__reactEngine
}

// ── Reflex Definition ────────────────────────────────────────────────────────

export interface Reflex {
  name: string
  description: string
  match: (signal: Signal) => boolean
  action: (signal: Signal) => Promise<void>
  cooldownMs: number
  priority: number
  autoStart: boolean
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerReflex(reflex: Reflex): void {
  engine().reflexes.set(reflex.name, reflex)
  appendLog({
    type: 'system', source: 'react',
    message: `reflex "${reflex.name}" registered (cooldown ${reflex.cooldownMs}ms, priority ${reflex.priority})`,
  })
}

export function unregisterReflex(name: string): void {
  engine().reflexes.delete(name)
  engine().throttle.delete(name)
}

export function listReflexes(): Reflex[] {
  return [...engine().reflexes.values()].sort((a, b) => b.priority - a.priority)
}

// ── Signal Processing ────────────────────────────────────────────────────────

export function ingestSignal(signal: Signal): void {
  if (!engine().running) return

  for (const reflex of listReflexes()) {
    if (!reflex.match(signal)) continue

    // Cooldown check
    const last = engine().throttle.get(reflex.name) ?? 0
    if (Date.now() - last < reflex.cooldownMs) continue
    engine().throttle.set(reflex.name, Date.now())

    // Fire async — never block the signal pipeline. Escalate a failed reflex to
    // Core (a broken autonomic response is exactly the kind of silent failure we
    // must surface), deduped per-reflex by logNodeError's source key.
    void reflex.action(signal).catch((err) => {
      logNodeError(
        `react/reflex/${reflex.name}`,
        `reflex "${reflex.name}" action failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      )
    })
  }
}

// ── Built-in Reflexes ────────────────────────────────────────────────────────

function registerBuiltinReflexes(): void {
  // Reflex: when system health detects high memory, log a warning
  registerReflex({
    name: 'high-memory-warning',
    description: 'Log a warning when memory exceeds 90%',
    priority: 10,
    cooldownMs: 60_000,
    autoStart: true,
    match: (s) =>
      s.type === 'system_health' &&
      typeof s.metadata?.memoryPercent === 'number' &&
      (s.metadata.memoryPercent as number) > 90,
    action: async (s) => {
      appendLog({
        type: 'incident', source: 'react',
        message: `[HIGH] Memory at ${s.metadata?.memoryPercent}% — consider freeing resources`,
      })
    },
  })

  // Reflex: when CPU spikes, log it
  registerReflex({
    name: 'high-cpu-notice',
    description: 'Log when CPU exceeds 85%',
    priority: 10,
    cooldownMs: 120_000,
    autoStart: true,
    match: (s) =>
      s.type === 'system_health' &&
      typeof s.metadata?.cpuPercent === 'number' &&
      (s.metadata.cpuPercent as number) > 85,
    action: async (s) => {
      appendLog({
        type: 'incident', source: 'react',
        message: `[HIGH] CPU at ${s.metadata?.cpuPercent}% — load spike detected`,
      })
    },
  })

  // Reflex: when Ollama goes down, log and try to restart
  registerReflex({
    name: 'ollama-down-alert',
    description: 'Alert when Ollama becomes unavailable',
    priority: 20,
    cooldownMs: 300_000,
    autoStart: true,
    match: (s) =>
      s.type === 'system_health' &&
      s.metadata?.ollamaAvailable === false,
    action: async () => {
      appendLog({
        type: 'incident', source: 'react',
        message: `Ollama is down — check the service`,
      })
    },
  })

  // Reflex: when a single eye stops on repeated errors, try to restart JUST that eye
  // (not the whole engine — a bounded, cooldown-gated retry, not a sledgehammer that
  // bounces every other eye). The witness tick emits `eye_error` on terminal shutdown.
  registerReflex({
    name: 'eye-error-restart',
    description: 'Restart a single failed eye after it stops on repeated errors (cooldown-bounded)',
    priority: 30,
    cooldownMs: 120_000,
    autoStart: true,
    match: (s) => s.type === 'eye_error',
    action: async (s) => {
      const { startEye } = await import('./witness-engine')
      const ok = startEye(s.eyeId)
      appendLog({
        type: 'system', source: 'react',
        message: `auto-restart eye "${s.eyeId}" after repeated errors: ${ok ? 'restarted' : 'failed (no such eye / no producer)'}`,
      })
    },
  })

  // Reflex: when a new file arrives in a watched directory, log it
  registerReflex({
    name: 'file-arrival-log',
    description: 'Log new file arrivals',
    priority: 5,
    cooldownMs: 1_000,
    autoStart: true,
    match: (s) => s.type === 'file_arrival',
    action: async (s) => {
      appendLog({
        type: 'info', source: 'react',
        message: `File arrived: ${s.metadata?.path || s.summary}`,
      })
    },
  })

  // ── BOLO Reflexes ────────────────────────────────────────────────────────

  function boloPriority(s: Signal): string | undefined {
    const meta = s.metadata as Record<string, unknown> | undefined
    const bolo = meta?.bolo as Record<string, unknown> | undefined
    return bolo?.boloPriority as string | undefined
  }

  function boloData(s: Signal): Record<string, unknown> | undefined {
    const meta = s.metadata as Record<string, unknown> | undefined
    return meta?.bolo as Record<string, unknown> | undefined
  }

  // Reflex: critical BOLO — active threat detected (weapon, fire, violence)
  registerReflex({
    name: 'bolo-critical-threat',
    description: 'Escalate critical BOLO threats immediately',
    priority: 100,
    cooldownMs: 30_000,
    autoStart: true,
    match: (s) => s.type === 'bolo_analysis' && boloPriority(s) === 'critical',
    action: async (s) => {
      const bolo = boloData(s)
      const flags = (bolo?.boloFlags as string[] | undefined) || []
      await createIncident({
        severity: 'critical',
        status: 'open',
        title: `CRITICAL: ${flags.join(', ') || 'Unknown threat'}`,
        description: `${s.summary}\nFlags: ${flags.join(', ')}\nRationale: ${(bolo?.boloRationale as string) || ''}`,
        source: 'guardian',
      })
      appendLog({
        type: 'incident', source: 'guardian',
        message: `[CRITICAL BOLO] ${s.summary} — incident created`,
      })
    },
  })

  // Reflex: high BOLO — potential threat
  registerReflex({
    name: 'bolo-high-alert',
    description: 'Log high-priority BOLO flags as incidents',
    priority: 80,
    cooldownMs: 60_000,
    autoStart: true,
    match: (s) => s.type === 'bolo_analysis' && boloPriority(s) === 'high',
    action: async (s) => {
      const bolo = boloData(s)
      const flags = (bolo?.boloFlags as string[] | undefined) || []
      await createIncident({
        severity: 'high',
        status: 'open',
        title: `BOLO Alert: ${flags.join(', ') || 'Situation'}`,
        description: `${s.summary}\nRationale: ${(bolo?.boloRationale as string) || ''}`,
        source: 'guardian',
      })
    },
  })

  // Reflex: medium BOLO — log as warning
  registerReflex({
    name: 'bolo-medium-notice',
    description: 'Log medium BOLO flags as warnings',
    priority: 50,
    cooldownMs: 120_000,
    autoStart: true,
    match: (s) => s.type === 'bolo_analysis' && boloPriority(s) === 'medium',
    action: async (s) => {
      appendLog({
        type: 'warning', source: 'guardian',
        message: `[BOLO/medium] ${s.summary}`,
      })
    },
  })
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export function startReactEngine(): void {
  const e = engine()
  if (e.running) return
  e.running = true
  registerBuiltinReflexes()
  appendLog({ type: 'system', source: 'react', message: `react engine started (${e.reflexes.size} reflexes)` })
}

export function stopReactEngine(): void {
  engine().running = false
  appendLog({ type: 'system', source: 'react', message: 'react engine stopped' })
}

export function reactStatus() {
  const e = engine()
  return {
    running: e.running,
    reflexCount: e.reflexes.size,
    reflexes: [...e.reflexes.values()].map((r) => ({
      name: r.name,
      description: r.description,
      cooldownMs: r.cooldownMs,
      priority: r.priority,
      lastFired: e.throttle.get(r.name) ?? 0,
    })),
  }
}
