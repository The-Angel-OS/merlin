/**
 * Nimue — Photo Inventory Queue
 *
 * IndexedDB-backed queue for field inventory workflows.
 * Works offline; survives page reloads; dedupes by SHA-256.
 *
 * Lifecycle:
 *   pending → uploading → done
 *                     ↘ error (retryable with exponential backoff)
 *
 * Storage:
 *   - DB: "nimue-inventory", v1
 *   - Stores: "items" (primary), "batches" (metadata)
 */
import { openDB, type IDBPDatabase } from 'idb'

// ─── Types ──────────────────────────────────────────────────────────────────

export type InventoryStatus = 'pending' | 'uploading' | 'done' | 'error'

export type InventoryCollection =
  | 'media'
  | 'products'
  | 'spaces'
  | 'dashcam'
  | 'other'

export interface InventoryItem {
  /** Stable id — content hash (SHA-256 hex truncated to 16 chars). */
  id: string
  /** Raw binary content. */
  blob: Blob
  /** MIME type from the file. */
  mime: string
  /** Human-readable filename. */
  filename: string
  /** Size in bytes (mirrored for queries without loading the blob). */
  size: number
  /** Timestamp when the user captured/added this item (ms epoch). */
  capturedAt: number
  /** Optional GPS from EXIF or geolocation. */
  lat?: number
  lon?: number
  /** Free-form tag chips. */
  tags: string[]
  /** Target Angel OS collection. */
  collection: InventoryCollection
  /** Optional user notes (becomes alt text on media upload). */
  notes?: string
  /** Batch this item belongs to. */
  batchId: string
  /** Current state. */
  status: InventoryStatus
  /** Retry count (for error state). */
  attempts: number
  /** Last error message (present when status === 'error'). */
  lastError?: string
  /** When to next retry (ms epoch). Set on error with exponential backoff. */
  nextRetryAt?: number
  /** When the item was created in the queue. */
  createdAt: number
  /** When the upload finished (status === 'done'). */
  uploadedAt?: number
  /** Server-side Media doc id after successful upload. */
  remoteMediaId?: string | number
}

export interface InventoryBatch {
  id: string
  name: string
  collection: InventoryCollection
  tags: string[]
  notes?: string
  createdAt: number
  /** Tenant slug this batch is scoped to (or 'default' if unscoped). */
  tenant: string
}

// ─── DB ─────────────────────────────────────────────────────────────────────

const DB_NAME = 'nimue-inventory'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this environment')
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('items')) {
          const items = db.createObjectStore('items', { keyPath: 'id' })
          items.createIndex('by_status', 'status')
          items.createIndex('by_batch', 'batchId')
          items.createIndex('by_createdAt', 'createdAt')
          items.createIndex('by_nextRetryAt', 'nextRetryAt')
        }
        if (!db.objectStoreNames.contains('batches')) {
          const batches = db.createObjectStore('batches', { keyPath: 'id' })
          batches.createIndex('by_createdAt', 'createdAt')
        }
      },
    })
  }
  return dbPromise
}

/** Close and reset the connection cache — used only in tests. */
export async function _resetDbForTests(): Promise<void> {
  if (dbPromise) {
    try { (await dbPromise).close() } catch { /* ignore */ }
  }
  dbPromise = null
}

// ─── Hashing ────────────────────────────────────────────────────────────────

/** SHA-256 of a blob, truncated to 16 hex chars (64 bits — plenty for dedupe).
 *
 * `crypto.subtle` is only defined in secure contexts (HTTPS + localhost). Over
 * plain HTTP on a LAN IP it's undefined and calling it throws. We fall back to
 * a cheap FNV-1a hash so the queue still dedupes (weaker, but good enough for
 * a single-user field-capture queue — the server re-derives the real hash).
 */
export async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const digest = await subtle.digest('SHA-256', buf)
      const hex = Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      return hex.slice(0, 16)
    } catch {
      /* fall through to FNV-1a */
    }
  }
  // FNV-1a 64-bit-ish fallback — non-secure-context safe.
  const bytes = new Uint8Array(buf)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ bytes[bytes.length - 1 - i], 0x811c9dc5) >>> 0
  }
  const hex = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
  return hex.slice(0, 16)
}

/** UUID with non-secure-context fallback. `crypto.randomUUID` is undefined on
 *  http://LAN-IP — we substitute a Math.random v4-ish id so queue inserts work. */
function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID() } catch { /* fall through */ }
  }
  const rnd = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${['8','9','a','b'][Math.floor(Math.random()*4)]}${rnd(3)}-${rnd(12)}`
}

// ─── Backoff ────────────────────────────────────────────────────────────────

const BACKOFF_BASE_MS = 2_000
const BACKOFF_MAX_MS = 5 * 60_000 // 5 min cap

/** Exponential backoff with jitter. attempt=0 → ~2s, attempt=6 → capped at 5min. */
export function computeBackoff(attempts: number): number {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_MAX_MS)
  const jitter = Math.random() * 0.3 * exp
  return Math.floor(exp + jitter)
}

// ─── Batch operations ───────────────────────────────────────────────────────

export async function createBatch(init: Omit<InventoryBatch, 'id' | 'createdAt'>): Promise<InventoryBatch> {
  const db = await getDb()
  const batch: InventoryBatch = {
    ...init,
    id: safeUUID(),
    createdAt: Date.now(),
  }
  await db.put('batches', batch)
  return batch
}

export async function getBatch(id: string): Promise<InventoryBatch | undefined> {
  const db = await getDb()
  return db.get('batches', id)
}

export async function listBatches(): Promise<InventoryBatch[]> {
  const db = await getDb()
  const all = await db.getAll('batches')
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

// ─── Item operations ────────────────────────────────────────────────────────

export interface AddItemInput {
  file: File | Blob
  filename?: string
  capturedAt?: number
  lat?: number
  lon?: number
  tags?: string[]
  notes?: string
  batchId: string
  collection: InventoryCollection
}

/**
 * Add an item to the queue. Returns existing item if the blob content
 * already exists (SHA-256 match) — dedupe is idempotent.
 */
export async function addItem(input: AddItemInput): Promise<InventoryItem> {
  const db = await getDb()
  const id = await hashBlob(input.file)

  const existing = await db.get('items', id)
  if (existing) return existing

  const file = input.file as File
  const item: InventoryItem = {
    id,
    blob: input.file,
    mime: input.file.type || 'application/octet-stream',
    filename: input.filename ?? file.name ?? `item-${id}`,
    size: input.file.size,
    capturedAt: input.capturedAt ?? (file.lastModified || Date.now()),
    lat: input.lat,
    lon: input.lon,
    tags: input.tags ?? [],
    collection: input.collection,
    notes: input.notes,
    batchId: input.batchId,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  }
  await db.put('items', item)
  return item
}

export async function getItem(id: string): Promise<InventoryItem | undefined> {
  const db = await getDb()
  return db.get('items', id)
}

export async function listItems(opts: {
  status?: InventoryStatus
  batchId?: string
  limit?: number
} = {}): Promise<InventoryItem[]> {
  const db = await getDb()
  let items: InventoryItem[]
  if (opts.status) {
    items = await db.getAllFromIndex('items', 'by_status', opts.status)
  } else if (opts.batchId) {
    items = await db.getAllFromIndex('items', 'by_batch', opts.batchId)
  } else {
    items = await db.getAll('items')
  }
  items.sort((a, b) => b.createdAt - a.createdAt)
  return opts.limit ? items.slice(0, opts.limit) : items
}

export async function updateItem(id: string, patch: Partial<InventoryItem>): Promise<InventoryItem | undefined> {
  const db = await getDb()
  const current = await db.get('items', id)
  if (!current) return undefined
  const next = { ...current, ...patch }
  await db.put('items', next)
  return next
}

export async function removeItem(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('items', id)
}

/** Remove all items in 'done' state older than the given age (default 7 days). */
export async function purgeDoneItems(olderThanMs = 7 * 86_400_000): Promise<number> {
  const db = await getDb()
  const cutoff = Date.now() - olderThanMs
  const done = await db.getAllFromIndex('items', 'by_status', 'done')
  const toDelete = done.filter(i => (i.uploadedAt ?? i.createdAt) <= cutoff)
  const tx = db.transaction('items', 'readwrite')
  await Promise.all(toDelete.map(i => tx.store.delete(i.id)))
  await tx.done
  return toDelete.length
}

// ─── Queue stats ────────────────────────────────────────────────────────────

export interface QueueStats {
  total: number
  pending: number
  uploading: number
  done: number
  error: number
  totalBytes: number
  pendingBytes: number
}

export async function getStats(): Promise<QueueStats> {
  const db = await getDb()
  const all = await db.getAll('items')
  const stats: QueueStats = {
    total: all.length,
    pending: 0,
    uploading: 0,
    done: 0,
    error: 0,
    totalBytes: 0,
    pendingBytes: 0,
  }
  for (const item of all) {
    stats.totalBytes += item.size
    // TS narrows item.status to InventoryStatus, which matches the numeric
    // fields in QueueStats 1:1 — safe increment.
    stats[item.status as 'pending' | 'uploading' | 'done' | 'error']++
    if (item.status === 'pending' || item.status === 'uploading' || item.status === 'error') {
      stats.pendingBytes += item.size
    }
  }
  return stats
}

// ─── Dequeue for upload ─────────────────────────────────────────────────────

/**
 * Get the next batch of items ready to be uploaded.
 * Includes pending items + error items whose nextRetryAt has elapsed.
 */
export async function getUploadable(limit = 4): Promise<InventoryItem[]> {
  const db = await getDb()
  const [pending, errored] = await Promise.all([
    db.getAllFromIndex('items', 'by_status', 'pending'),
    db.getAllFromIndex('items', 'by_status', 'error'),
  ])
  const now = Date.now()
  const retryReady = errored.filter(i => (i.nextRetryAt ?? 0) <= now)
  const ready = [...pending, ...retryReady]
  ready.sort((a, b) => a.createdAt - b.createdAt)
  return ready.slice(0, limit)
}

// ─── Transitions ────────────────────────────────────────────────────────────

export async function markUploading(id: string): Promise<void> {
  await updateItem(id, { status: 'uploading', lastError: undefined })
}

export async function markDone(id: string, remoteMediaId?: string | number): Promise<void> {
  await updateItem(id, {
    status: 'done',
    uploadedAt: Date.now(),
    remoteMediaId,
    lastError: undefined,
    nextRetryAt: undefined,
  })
}

export async function markError(id: string, message: string): Promise<void> {
  const current = await getItem(id)
  if (!current) return
  const attempts = current.attempts + 1
  const backoff = computeBackoff(attempts - 1)
  await updateItem(id, {
    status: 'error',
    attempts,
    lastError: message.slice(0, 500),
    nextRetryAt: Date.now() + backoff,
  })
}

export async function retryItem(id: string): Promise<void> {
  await updateItem(id, {
    status: 'pending',
    lastError: undefined,
    nextRetryAt: undefined,
  })
}

/** Reset any 'uploading' items that got stuck (e.g. tab closed mid-upload). */
export async function recoverStuck(): Promise<number> {
  const db = await getDb()
  const stuck = await db.getAllFromIndex('items', 'by_status', 'uploading')
  const tx = db.transaction('items', 'readwrite')
  await Promise.all(stuck.map(i => tx.store.put({ ...i, status: 'pending' as const })))
  await tx.done
  return stuck.length
}
