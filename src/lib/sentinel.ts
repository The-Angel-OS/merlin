/**
 * sentinel.ts — change-detection camera/window sentinel, MULTI-SOURCE.
 *
 * Watches one OR MANY sources (cameras via dshow, windows via gdigrab), each with its
 * own baseline. Each tick captures every source in turn, fingerprints it (sharp →
 * 64x64 grayscale), compares to that source's previous frame (mean-abs-diff), and
 * submits through the file bridge ONLY when the scene changed beyond a threshold.
 *
 * Black/occluded windows (gdigrab returns a near-black frame for minimized/occluded
 * windows) are detected and skipped with a clear log instead of submitting black —
 * the pragmatic handling for the gdigrab black-window limitation.
 */
import sharp from 'sharp'
import { captureFrame } from './camera'
import { submitSnapshot } from './node-bus'
import { getSettings, updateSettings, appendLog } from './store'

export type SourceLast = {
  at: string
  changed: boolean
  diff: number
  blank?: boolean
  url?: string
  error?: string
}
declare global {
  // eslint-disable-next-line no-var
  var __merlinSentinel:
    | { timer?: NodeJS.Timeout; running?: boolean; busy?: boolean; prev: Record<string, Buffer>; last: Record<string, SourceLast> }
    | undefined
}

const DIM = 64
const BLANK_MAX = 12 // a 64x64 grayscale frame whose brightest pixel is below this ≈ all-black

/** Parse a source spec "camera:Name" / "window:Title" → captureFrame args + label. */
function parseSource(spec: string): { device?: string; window?: string; label: string } {
  const i = spec.indexOf(':')
  const kind = i >= 0 ? spec.slice(0, i) : 'camera'
  const name = i >= 0 ? spec.slice(i + 1) : spec
  return kind === 'window' ? { window: name, label: spec } : { device: name, label: spec }
}

/** The sources to watch: explicit multi-source list, else the legacy single source. */
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

/** Near-black frame (minimized/occluded window) — the brightest pixel is ~0. */
function isBlank(fp: Buffer): boolean {
  let max = 0
  for (let i = 0; i < fp.length; i++) if (fp[i] > max) max = fp[i]
  return max < BLANK_MAX
}

async function tickSource(spec: string): Promise<void> {
  const g = globalThis.__merlinSentinel!
  const now = () => new Date().toISOString()
  const { device, window, label } = parseSource(spec)

  const snap = await captureFrame({ device, window })
  if (!snap.ok || !snap.buffer) {
    g.last[label] = { at: now(), changed: false, diff: 0, error: snap.error }
    return
  }

  const fp = await fingerprint(snap.buffer)
  if (isBlank(fp)) {
    g.prev[label] = fp
    g.last[label] = { at: now(), changed: false, diff: 0, blank: true }
    appendLog({ type: 'system', source: 'sentinel', message: `${label}: blank frame (minimized/occluded?) — skipped` })
    return
  }

  const s = getSettings()
  const threshold = s.sentinelThreshold > 0 ? s.sentinelThreshold : 0.04
  const prev = g.prev[label]
  const diff = prev ? meanAbsDiff(prev, fp) : 1 // first non-blank frame = baseline → submits
  g.prev[label] = fp
  const changed = diff >= threshold
  g.last[label] = { at: now(), changed, diff }
  if (!changed) return

  const up = await submitSnapshot(snap.buffer, snap.filename!, snap.mimetype!, `Sentinel: change Δ${(diff * 100).toFixed(1)}% on ${snap.device}`)
  g.last[label].url = up.url
  appendLog({
    type: up.ok ? 'angels' : 'error',
    source: 'sentinel',
    message: up.ok ? `${label}: change Δ${(diff * 100).toFixed(1)}% → submitted ${up.url}` : `${label}: change but submit failed: ${up.error}`,
  })
}

async function tick(): Promise<void> {
  const g = globalThis.__merlinSentinel
  if (!g || g.busy) return
  g.busy = true
  try {
    if (!getSettings().sentinelEnabled) return
    // Sequential — ffmpeg grabs one device/window at a time to avoid contention.
    for (const spec of resolveSources()) await tickSource(spec)
  } catch (e) {
    appendLog({ type: 'error', source: 'sentinel', message: `tick error: ${e instanceof Error ? e.message : e}` })
  } finally {
    g.busy = false
  }
}

export function startSentinel(): { running: boolean; intervalMs: number } {
  updateSettings({ sentinelEnabled: true })
  const g = globalThis.__merlinSentinel || (globalThis.__merlinSentinel = { prev: {}, last: {} })
  const s = getSettings()
  const intervalMs = s.sentinelIntervalMs >= 1000 ? s.sentinelIntervalMs : 5000
  if (g.running) return { running: true, intervalMs }
  g.running = true
  g.prev = {}
  g.last = {}
  void tick()
  g.timer = setInterval(() => void tick(), intervalMs)
  appendLog({
    type: 'system',
    source: 'sentinel',
    message: `sentinel started — ${resolveSources().length} source(s), every ${intervalMs}ms, threshold ${(s.sentinelThreshold || 0.04)}`,
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
    g.prev = {}
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
    sources: resolveSources(),
    intervalMs: s.sentinelIntervalMs || 5000,
    threshold: s.sentinelThreshold || 0.04,
    last: g?.last || {},
  }
}
