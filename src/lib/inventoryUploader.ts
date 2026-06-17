/**
 * Nimue — Inventory Uploader
 *
 * Polls the queue, uploads items to Angel OS, handles retry + backoff.
 * Singleton: call startUploader() once from the app shell.
 *
 * Target endpoint: POST /api/payload/media (multipart/form-data)
 *   Fields: file (blob), alt (string), tags (JSON array), notes (string)
 *
 * Concurrency is bounded to MAX_PARALLEL uploads at a time.
 */
import {
  getUploadable,
  markUploading,
  markDone,
  markError,
  recoverStuck,
  type InventoryItem,
} from './inventoryQueue'

// ─── Config ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3_000
const MAX_PARALLEL = 2
const UPLOAD_ENDPOINT = '/api/payload/media'
const UPLOAD_TIMEOUT_MS = 60_000

// ─── Events ─────────────────────────────────────────────────────────────────

type UploaderEvent =
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'online'; online: boolean }
  | { type: 'item-start'; id: string }
  | { type: 'item-done'; id: string; remoteMediaId?: string | number }
  | { type: 'item-error'; id: string; error: string }
  | { type: 'queue-empty' }

type Listener = (ev: UploaderEvent) => void

const listeners = new Set<Listener>()

export function onUploaderEvent(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(ev: UploaderEvent) {
  for (const fn of listeners) {
    try { fn(ev) } catch { /* swallow listener errors */ }
  }
  // Also dispatch a DOM CustomEvent so React components can listen via a hook
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('nimue:uploader', { detail: ev }))
    } catch { /* noop */ }
  }
}

// ─── Upload impl ────────────────────────────────────────────────────────────

export async function uploadOne(item: InventoryItem): Promise<{ remoteMediaId?: string | number }> {
  const form = new FormData()
  const file = new File([item.blob], item.filename, { type: item.mime })
  form.append('file', file)
  form.append('alt', item.notes || item.filename)
  if (item.tags.length) form.append('tags', JSON.stringify(item.tags))
  if (item.notes) form.append('notes', item.notes)
  if (item.lat !== undefined) form.append('lat', String(item.lat))
  if (item.lon !== undefined) form.append('lon', String(item.lon))
  form.append('capturedAt', String(item.capturedAt))
  form.append('collection', item.collection)
  form.append('batchId', item.batchId)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      body: form,
      signal: controller.signal,
      credentials: 'include',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`)
    }
    const body = await res.json().catch(() => ({}))
    return { remoteMediaId: body?.doc?.id ?? body?.id }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Runtime state ──────────────────────────────────────────────────────────

let running = false
let pollTimer: ReturnType<typeof setTimeout> | null = null
let active = 0

async function processOne(item: InventoryItem) {
  active++
  emit({ type: 'item-start', id: item.id })
  try {
    await markUploading(item.id)
    const { remoteMediaId } = await uploadOne(item)
    await markDone(item.id, remoteMediaId)
    emit({ type: 'item-done', id: item.id, remoteMediaId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markError(item.id, msg)
    emit({ type: 'item-error', id: item.id, error: msg })
  } finally {
    active--
  }
}

async function tick() {
  if (!running) return

  // If we're offline, skip this tick (browser event will wake us)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    scheduleNext()
    return
  }

  const slots = Math.max(0, MAX_PARALLEL - active)
  if (slots > 0) {
    const ready = await getUploadable(slots)
    if (ready.length === 0 && active === 0) {
      emit({ type: 'queue-empty' })
    }
    await Promise.all(ready.map(item => processOne(item)))
  }

  scheduleNext()
}

function scheduleNext() {
  if (!running) return
  pollTimer = setTimeout(tick, POLL_INTERVAL_MS)
}

function onOnline() { emit({ type: 'online', online: true }); if (running) tick() }
function onOffline() { emit({ type: 'online', online: false }) }

/** Start the uploader loop. Idempotent. */
export async function startUploader(): Promise<void> {
  if (running) return
  running = true
  await recoverStuck().catch(() => {})
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
  }
  emit({ type: 'started' })
  tick()
}

/** Stop the uploader loop. In-flight uploads continue until they settle. */
export function stopUploader(): void {
  if (!running) return
  running = false
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
  emit({ type: 'stopped' })
}

export function isUploaderRunning(): boolean {
  return running
}
