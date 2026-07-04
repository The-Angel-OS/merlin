import sharp from 'sharp'
import { captureFrame } from './camera'
import { getSettings, appendLog } from './store'
import { logNodeError } from './nodeError'
import { registerProducer, registerEye, unregisterEye, startEye, stopEye, activeWitnesses, emitSignal } from './witness-engine'
import { ingestSignal } from './react-engine'
import { analyzeFrame } from './bolo-engine'
import type { EyeConfig, Signal, EyeState } from './witness-types'
import type { SnapResult } from './camera'

const DIM = 64
const BLANK_MAX = 12

// Hardware safety: cap concurrent vision (BOLO) inferences across the WHOLE node.
// llava/moondream on CPU can peg a core for 30–60s; without this, a busy scene
// (motion detected every tick) would stack inferences until an enthusiast box OOMs
// or thermal-throttles. Default 1 = at most one vision call at a time; a GPU node
// can raise it via BOLO_MAX_CONCURRENT.
const BOLO_MAX_CONCURRENT = Math.max(1, Number(process.env.BOLO_MAX_CONCURRENT) || 1)
let boloInFlight = 0

interface SourcePrev {
  buffer: Buffer
  label: string
}

const prevFrames = new Map<string, SourcePrev>()

function parseSource(spec: string): { device?: string; window?: string; label: string } {
  const i = spec.indexOf(':')
  const kind = i >= 0 ? spec.slice(0, i) : 'camera'
  const name = i >= 0 ? spec.slice(i + 1) : spec
  return kind === 'window' ? { window: name, label: spec } : { device: name, label: spec }
}

export function resolveSources(): string[] {
  const s = getSettings()
  if (s.sentinelSources && s.sentinelSources.length) return s.sentinelSources
  if (s.sentinelWindow) return [`window:${s.sentinelWindow}`]
  if (s.sentinelDevice || s.cameraDevice) return [`camera:${s.sentinelDevice || s.cameraDevice}`]
  return []
}

async function fingerprint(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg).removeAlpha().resize(DIM, DIM, { fit: 'fill' }).grayscale().raw().toBuffer()
}

function meanAbsDiff(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  if (!n) return 1
  let sum = 0
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return sum / n / 255
}

function isBlank(fp: Buffer): boolean {
  let max = 0
  for (let i = 0; i < fp.length; i++) if (fp[i] > max) max = fp[i]
  return max < BLANK_MAX
}

async function cameraEyeProducer(eye: EyeState): Promise<Signal | null> {
  const spec = eye.config.source || ''
  const { device, window, label } = parseSource(spec)
  const s = getSettings()
  const threshold = s.sentinelThreshold > 0 ? s.sentinelThreshold : 0.04

  const snap = await captureFrame({ device, window })
  if (!snap.ok || !snap.buffer) return null

  const fp = await fingerprint(snap.buffer)
  if (isBlank(fp)) {
    prevFrames.set(label, { buffer: fp, label })
    return null
  }

  const prev = prevFrames.get(label)
  const diff = prev ? meanAbsDiff(prev.buffer, fp) : 1
  prevFrames.set(label, { buffer: fp, label })

  if (diff < threshold) return null

  const base64 = snap.buffer.toString('base64')

  // Fire-and-forget BOLO vision analysis in the background — never blocks motion
  // detection. Concurrency-capped (see BOLO_MAX_CONCURRENT): at capacity we SKIP this
  // frame's analysis rather than pile on. Motion is still recorded — vision is
  // best-effort, not guaranteed-per-frame — so a busy scene can't cook the hardware.
  if (boloInFlight < BOLO_MAX_CONCURRENT) {
    boloInFlight++
    void analyzeFrame(base64, label)
      .then((result) => {
        if (!result.ok || !result.analysis) return
        return emitSignal({
          id: `${eye.config.id}:bolo:${Date.now()}`,
          eyeId: eye.config.id,
          eyeType: 'camera',
          type: 'bolo_analysis',
          confidence: result.analysis.confidence,
          summary: `BOLO: ${result.analysis.scene}`,
          timestamp: new Date().toISOString(),
          mediaUrl: snap.filename,
          location: eye.config.location,
          metadata: {
            bolo: result.analysis,
            model: result.model,
            elapsedMs: result.elapsedMs,
          },
        })
      })
      .catch((e) => logNodeError('sentinel/bolo', `BOLO analysis/emit failed for ${label}: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => { boloInFlight-- })
  }

  return {
    id: `${eye.config.id}:${Date.now()}`,
    eyeId: eye.config.id,
    eyeType: 'camera',
    type: 'motion',
    confidence: Math.min(1, diff / 0.1),
    summary: `Motion detected on ${snap.device || label} (Δ${(diff * 100).toFixed(1)}%)`,
    timestamp: new Date().toISOString(),
    mediaUrl: snap.filename,
    location: eye.config.location,
    // Data minimization (Constitution Art. V): NO raw base64 in the signal — it
    // gets persisted to the local log and pushed to every WS subscriber. Raw frames
    // go to the endeavor ONLY via the explicit Media bridge (submitSnapshot), never
    // smuggled through a logged/graduated signal.
    metadata: {
      diff,
      device: snap.device,
      label,
      analysisPending: true,
      filename: snap.filename,
      mimetype: snap.mimetype,
    },
  }
}

export function enableCameraEyes(config?: Partial<EyeConfig>): void {
  registerProducer('camera', cameraEyeProducer)
  const sources = resolveSources()

  for (const spec of sources) {
    const { label } = parseSource(spec)
    const eyeId = `camera:${label.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    registerEye({
      id: eyeId,
      type: 'camera',
      label: `Camera: ${label}`,
      enabled: true,
      intervalMs: (config?.intervalMs ?? getSettings().sentinelIntervalMs) || 5000,
      source: spec,
      threshold: (config?.threshold ?? getSettings().sentinelThreshold) || 0.04,
      location: config?.location,
    })
    startEye(eyeId)
  }

  if (sources.length) {
    appendLog({ type: 'system', source: 'sentinel', message: `camera eyes enabled: ${sources.join(', ')}` })
  }
}

export function disableCameraEyes(): void {
  for (const eye of activeWitnesses()) {
    if (eye.type === 'camera') {
      stopEye(eye.id)
      unregisterEye(eye.id)
    }
  }
  prevFrames.clear()
  appendLog({ type: 'system', source: 'sentinel', message: 'camera eyes disabled' })
}

export function startSentinel(): { running: boolean; intervalMs: number } {
  const s = getSettings()
  const intervalMs = s.sentinelIntervalMs >= 1000 ? s.sentinelIntervalMs : 5000
  enableCameraEyes({ intervalMs })
  return { running: true, intervalMs }
}

export function stopSentinel(): { running: boolean } {
  disableCameraEyes()
  return { running: false }
}

export function sentinelStatus() {
  const s = getSettings()
  const witnesses = activeWitnesses().filter((w) => w.type === 'camera')
  return {
    running: witnesses.some((w) => w.status === 'active'),
    enabled: s.sentinelEnabled,
    sources: resolveSources(),
    eyes: witnesses,
    intervalMs: s.sentinelIntervalMs || 5000,
    threshold: s.sentinelThreshold || 0.04,
  }
}
