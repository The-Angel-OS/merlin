/**
 * sentinel.ts — change-detection camera sentinel.
 *
 * Polls the camera on an interval, compares each frame to the previous one
 * (downsampled grayscale mean-absolute-difference via sharp), and submits ONLY
 * when the scene changed beyond a threshold — the classic motion sentinel, so a
 * disused laptop watches quietly and only pushes a frame when something happens.
 * Submissions ride the file bridge (submitSnapshot → endeavor Media).
 */
import sharp from 'sharp'
import { snapCamera } from './camera'
import { submitSnapshot } from './node-bus'
import { getSettings, updateSettings, appendLog } from './store'

type SentinelLast = { at: string; changed: boolean; diff: number; url?: string }
declare global {
  // eslint-disable-next-line no-var
  var __merlinSentinel:
    | { timer?: NodeJS.Timeout; running?: boolean; prev?: Buffer; busy?: boolean; last?: SentinelLast }
    | undefined
}

const DIM = 64 // downsample to 64x64 grayscale for a cheap, stable fingerprint

async function fingerprint(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg).removeAlpha().resize(DIM, DIM, { fit: 'fill' }).grayscale().raw().toBuffer()
}

function meanAbsDiff(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  if (!n) return 1
  let sum = 0
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return sum / n / 255 // 0..1
}

async function tick(): Promise<void> {
  const g = globalThis.__merlinSentinel
  if (!g || g.busy) return
  g.busy = true
  try {
    const s = getSettings()
    if (!s.sentinelEnabled) return
    const snap = await snapCamera(s.sentinelDevice || s.cameraDevice || undefined)
    if (!snap.ok || !snap.buffer) {
      appendLog({ type: 'error', source: 'sentinel', message: `snap failed: ${snap.error}` })
      return
    }
    const fp = await fingerprint(snap.buffer)
    const threshold = s.sentinelThreshold > 0 ? s.sentinelThreshold : 0.04
    const diff = g.prev ? meanAbsDiff(g.prev, fp) : 1 // first frame always submits (baseline)
    g.prev = fp
    const changed = diff >= threshold
    g.last = { at: new Date().toISOString(), changed, diff }
    if (!changed) return
    const up = await submitSnapshot(
      snap.buffer,
      snap.filename!,
      snap.mimetype!,
      `Sentinel: change detected (Δ${(diff * 100).toFixed(1)}%) on ${snap.device}`,
    )
    g.last.url = up.url
    appendLog({
      type: up.ok ? 'angels' : 'error',
      source: 'sentinel',
      message: up.ok
        ? `change Δ${(diff * 100).toFixed(1)}% → submitted ${up.url}`
        : `change Δ${(diff * 100).toFixed(1)}% but submit failed: ${up.error}`,
    })
  } catch (e) {
    appendLog({ type: 'error', source: 'sentinel', message: `tick error: ${e instanceof Error ? e.message : e}` })
  } finally {
    g.busy = false
  }
}

export function startSentinel(): { running: boolean; intervalMs: number } {
  updateSettings({ sentinelEnabled: true })
  const g = globalThis.__merlinSentinel || (globalThis.__merlinSentinel = {})
  const s = getSettings()
  const intervalMs = s.sentinelIntervalMs >= 1000 ? s.sentinelIntervalMs : 5000
  if (g.running) return { running: true, intervalMs }
  g.running = true
  g.prev = undefined
  void tick()
  g.timer = setInterval(() => void tick(), intervalMs)
  appendLog({
    type: 'system',
    source: 'sentinel',
    message: `sentinel started (every ${intervalMs}ms, threshold ${(s.sentinelThreshold || 0.04)})`,
  })
  return { running: true, intervalMs }
}

export function stopSentinel(): { running: boolean } {
  updateSettings({ sentinelEnabled: false })
  const g = globalThis.__merlinSentinel
  if (g?.timer) clearInterval(g.timer)
  if (g) {
    g.running = false
    g.timer = undefined
    g.prev = undefined
  }
  appendLog({ type: 'system', source: 'sentinel', message: 'sentinel stopped' })
  return { running: false }
}

export function sentinelStatus() {
  const g = globalThis.__merlinSentinel
  const s = getSettings()
  return {
    running: Boolean(g?.running),
    enabled: s.sentinelEnabled,
    device: s.sentinelDevice || s.cameraDevice || '',
    intervalMs: s.sentinelIntervalMs || 5000,
    threshold: s.sentinelThreshold || 0.04,
    last: g?.last || null,
  }
}
