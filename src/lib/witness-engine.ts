import { appendLog } from './store'
import { logSignal } from './messageLog'
import type { EyeConfig, EyeState, Signal, Subscriber, WitnessCatalogEntry } from './witness-types'

declare global {
  var __witnessEngine:
    | {
        eyes: Map<string, EyeState>
        timers: Map<string, NodeJS.Timeout>
        subscribers: Map<string, Subscriber>
        running: boolean
      }
    | undefined
}

const DEDUP_WINDOW_MS = 2_000

function engine() {
  if (!globalThis.__witnessEngine) {
    globalThis.__witnessEngine = { eyes: new Map(), timers: new Map(), subscribers: new Map(), running: false }
  }
  return globalThis.__witnessEngine
}

// ── Eye Registration ─────────────────────────────────────────────────────────

export function registerEye(config: EyeConfig): void {
  const e = engine()
  if (e.eyes.has(config.id)) {
    appendLog({ type: 'system', source: 'witness', message: `eye "${config.id}" already registered — updating config` })
  }
  e.eyes.set(config.id, { config, running: false, consecutiveErrors: 0 })
  appendLog({ type: 'system', source: 'witness', message: `eye "${config.id}" (${config.type}) registered, interval ${config.intervalMs}ms` })
}

export function unregisterEye(id: string): void {
  const e = engine()
  stopEye(id)
  e.eyes.delete(id)
  appendLog({ type: 'system', source: 'witness', message: `eye "${id}" unregistered` })
}

export function getEye(id: string): EyeState | undefined {
  return engine().eyes.get(id)
}

export function listEyes(): EyeState[] {
  return [...engine().eyes.values()]
}

export function activeWitnesses(): WitnessCatalogEntry[] {
  return [...engine().eyes.values()].map((es) => ({
    id: es.config.id,
    type: es.config.type,
    label: es.config.label,
    capability: eyeTypeToCapability(es.config.type),
    status: es.error ? 'error' : es.running ? 'active' : 'offline',
    lastSignalAt: es.lastSignalAt,
    location: es.config.location,
  }))
}

function eyeTypeToCapability(t: string): string {
  switch (t) {
    case 'camera': return 'motion_detect'
    case 'file_watch': return 'file_arrival'
    case 'system_health': return 'system_telemetry'
    case 'network_probe': return 'network_scan'
    case 'microphone': return 'audio_event'
    case 'process_watch': return 'process_monitor'
    default: return 'custom_witness'
  }
}

// ── Producer Contract ────────────────────────────────────────────────────────

export type ProduceFn = (eye: EyeState) => Promise<Signal | null>

const producers = new Map<string, ProduceFn>()

export function registerProducer(type: string, fn: ProduceFn): void {
  producers.set(type, fn)
}

// ── Start / Stop Eyes ────────────────────────────────────────────────────────

export function startEye(id: string): boolean {
  const e = engine()
  const state = e.eyes.get(id)
  if (!state) return false
  if (state.running) return true

  const fn = producers.get(state.config.type)
  if (!fn) {
    appendLog({ type: 'error', source: 'witness', message: `no producer registered for eye type "${state.config.type}" (eye: ${id})` })
    return false
  }

  state.running = true
  state.consecutiveErrors = 0

  const tick = async () => {
    const current = engine().eyes.get(id)
    if (!current || !current.running) return

    try {
      const signal = await fn(current)
      if (signal) {
        current.lastSignalAt = signal.timestamp
        await publishSignal(signal)
      }
      current.lastTickAt = Date.now()
      current.consecutiveErrors = 0
    } catch (err) {
      current.consecutiveErrors++
      const msg = err instanceof Error ? err.message : String(err)
      appendLog({ type: 'error', source: 'witness', message: `eye "${id}" tick failed (${current.consecutiveErrors}): ${msg}` })
      if (current.consecutiveErrors >= 5) {
        current.running = false
        appendLog({ type: 'error', source: 'witness', message: `eye "${id}" stopped after ${current.consecutiveErrors} consecutive errors` })
      }
    }
  }

  void tick()
  const timer = setInterval(() => void tick(), state.config.intervalMs)
  e.timers.set(id, timer)

  appendLog({ type: 'system', source: 'witness', message: `eye "${id}" started, every ${state.config.intervalMs}ms` })
  return true
}

export function stopEye(id: string): boolean {
  const e = engine()
  const state = e.eyes.get(id)
  if (!state) return false
  state.running = false
  const timer = e.timers.get(id)
  if (timer) { clearInterval(timer); e.timers.delete(id) }
  return true
}

export function startAllEyes(): void {
  for (const id of engine().eyes.keys()) startEye(id)
}

export function stopAllEyes(): void {
  for (const id of engine().eyes.keys()) stopEye(id)
}

// ── Signal Pipeline ──────────────────────────────────────────────────────────

const recentSignals = new Map<string, number>()

export async function emitSignal(signal: Signal): Promise<void> {
  return publishSignal(signal)
}

async function publishSignal(signal: Signal): Promise<void> {
  // Dedup: skip if we already published an identical signal within the window
  const key = `${signal.eyeId}:${signal.type}:${signal.summary}`
  const last = recentSignals.get(key)
  if (last && Date.now() - last < DEDUP_WINDOW_MS) return
  recentSignals.set(key, Date.now())

  // 1. Persist locally via messageLog (triage + graduated submit)
  void logSignal({
    type: `witness.${signal.type}`,
    payload: {
      eyeId: signal.eyeId,
      confidence: signal.confidence,
      summary: signal.summary,
      mediaUrl: signal.mediaUrl,
      metadata: signal.metadata,
      location: signal.location,
    },
  }).catch(() => {})

  // 2. Feed into the React Engine for autonomic reflex processing
  const { ingestSignal: reactIngest } = await import('./react-engine')
  reactIngest(signal)

  // 3. Push to local WebSocket subscribers
  pushToSubscribers(signal)
}

// ── WebSocket Subscriptions ──────────────────────────────────────────────────

export function addSubscriber(s: Subscriber): void {
  engine().subscribers.set(s.id, s)
  appendLog({ type: 'system', source: 'witness', message: `subscriber "${s.id}" added` })
}

export function removeSubscriber(id: string): void {
  engine().subscribers.delete(id)
}

function pushToSubscribers(signal: Signal): void {
  const payload = JSON.stringify({ type: 'signal', signal })
  for (const [id, sub] of engine().subscribers) {
    if (sub.filter && !sub.filter(signal)) continue
    if (sub.ws && sub.ws.readyState === sub.ws.OPEN) {
      try { sub.ws.send(payload) } catch { engine().subscribers.delete(id) }
    }
  }
}

// ── Engine Lifecycle ─────────────────────────────────────────────────────────

export function isEngineRunning(): boolean {
  return engine().running
}

export function startEngine(): void {
  const e = engine()
  if (e.running) return
  e.running = true
  startAllEyes()
  appendLog({ type: 'system', source: 'witness', message: `witness engine started (${e.eyes.size} eyes registered)` })
}

export function stopEngine(): void {
  const e = engine()
  stopAllEyes()
  e.running = false
  appendLog({ type: 'system', source: 'witness', message: 'witness engine stopped' })
}

export function engineStatus() {
  const e = engine()
  return {
    running: e.running,
    eyeCount: e.eyes.size,
    subscriberCount: e.subscribers.size,
    eyes: [...e.eyes.values()].map((es) => ({
      id: es.config.id,
      type: es.config.type,
      label: es.config.label,
      running: es.running,
      lastTickAt: es.lastTickAt,
      lastSignalAt: es.lastSignalAt,
      error: es.error,
      consecutiveErrors: es.consecutiveErrors,
      intervalMs: es.config.intervalMs,
    })),
  }
}
