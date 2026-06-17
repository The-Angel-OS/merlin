/**
 * Nimue — Inventory Queue unit tests.
 *
 * Covers: hash dedupe, CRUD, status transitions, exponential backoff,
 * stats, retry + recovery, purge.
 *
 * Uses fake-indexeddb (installed in vitest.setup.ts).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addItem,
  computeBackoff,
  createBatch,
  getItem,
  getStats,
  getUploadable,
  hashBlob,
  listBatches,
  listItems,
  markDone,
  markError,
  markUploading,
  purgeDoneItems,
  recoverStuck,
  removeItem,
  retryItem,
  updateItem,
  _resetDbForTests,
} from '@/lib/inventoryQueue'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fakeFile(content: string, name = 'pic.jpg', type = 'image/jpeg'): File {
  return new File([content], name, { type })
}

async function wipeDb() {
  await _resetDbForTests()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('nimue-inventory')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('hashBlob', () => {
  it('produces a stable 16-char hex hash', async () => {
    const a = await hashBlob(new Blob(['hello world']))
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('returns the same hash for identical content', async () => {
    const a = await hashBlob(new Blob(['same']))
    const b = await hashBlob(new Blob(['same']))
    expect(a).toBe(b)
  })

  it('returns different hashes for different content', async () => {
    const a = await hashBlob(new Blob(['one']))
    const b = await hashBlob(new Blob(['two']))
    expect(a).not.toBe(b)
  })
})

describe('computeBackoff', () => {
  it('grows exponentially from the 2s base', () => {
    // attempt 0 → ~2s, 1 → ~4s, 2 → ~8s (± 30% jitter)
    const a = computeBackoff(0)
    const b = computeBackoff(1)
    const c = computeBackoff(2)
    expect(a).toBeGreaterThanOrEqual(2_000)
    expect(a).toBeLessThanOrEqual(2_000 * 1.3)
    expect(b).toBeGreaterThanOrEqual(4_000)
    expect(b).toBeLessThanOrEqual(4_000 * 1.3)
    expect(c).toBeGreaterThanOrEqual(8_000)
    expect(c).toBeLessThanOrEqual(8_000 * 1.3)
  })

  it('caps at 5 minutes for very high attempts', () => {
    const huge = computeBackoff(50)
    expect(huge).toBeLessThanOrEqual(5 * 60_000 * 1.3)
    expect(huge).toBeGreaterThanOrEqual(5 * 60_000)
  })
})

describe('batch CRUD', () => {
  beforeEach(wipeDb)
  afterEach(wipeDb)

  it('creates and retrieves a batch', async () => {
    const b = await createBatch({
      name: 'Warehouse sweep',
      collection: 'media',
      tags: ['inventory'],
      tenant: 'ccm',
    })
    expect(b.id).toBeTruthy()
    expect(b.createdAt).toBeGreaterThan(0)

    const batches = await listBatches()
    expect(batches).toHaveLength(1)
    expect(batches[0].name).toBe('Warehouse sweep')
  })

  it('orders batches newest-first', async () => {
    const b1 = await createBatch({ name: 'first', collection: 'media', tags: [], tenant: 't' })
    await new Promise(r => setTimeout(r, 5))
    const b2 = await createBatch({ name: 'second', collection: 'media', tags: [], tenant: 't' })
    const all = await listBatches()
    expect(all[0].id).toBe(b2.id)
    expect(all[1].id).toBe(b1.id)
  })
})

describe('item CRUD + dedupe', () => {
  let batchId: string

  beforeEach(async () => {
    await wipeDb()
    const b = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    batchId = b.id
  })
  afterEach(wipeDb)

  it('adds an item and populates defaults', async () => {
    const item = await addItem({
      file: fakeFile('hello', 'h.jpg'),
      batchId,
      collection: 'media',
    })
    expect(item.status).toBe('pending')
    expect(item.attempts).toBe(0)
    expect(item.filename).toBe('h.jpg')
    expect(item.mime).toBe('image/jpeg')
    expect(item.tags).toEqual([])
    expect(item.size).toBe(5)
  })

  it('deduplicates identical content (idempotent add)', async () => {
    const a = await addItem({ file: fakeFile('same'), batchId, collection: 'media' })
    const b = await addItem({ file: fakeFile('same'), batchId, collection: 'media' })
    expect(a.id).toBe(b.id)
    const all = await listItems()
    expect(all).toHaveLength(1)
  })

  it('treats different content as different items', async () => {
    await addItem({ file: fakeFile('a'), batchId, collection: 'media' })
    await addItem({ file: fakeFile('b'), batchId, collection: 'media' })
    expect(await listItems()).toHaveLength(2)
  })

  it('updates partial fields', async () => {
    const item = await addItem({ file: fakeFile('x'), batchId, collection: 'media' })
    const updated = await updateItem(item.id, { notes: 'edited' })
    expect(updated?.notes).toBe('edited')
    expect(updated?.status).toBe('pending') // unchanged
  })

  it('removes items', async () => {
    const item = await addItem({ file: fakeFile('y'), batchId, collection: 'media' })
    await removeItem(item.id)
    expect(await getItem(item.id)).toBeUndefined()
  })

  it('lists by status', async () => {
    const a = await addItem({ file: fakeFile('a'), batchId, collection: 'media' })
    const b = await addItem({ file: fakeFile('b'), batchId, collection: 'media' })
    await markDone(a.id, 999)
    const pending = await listItems({ status: 'pending' })
    const done = await listItems({ status: 'done' })
    expect(pending.map(i => i.id)).toEqual([b.id])
    expect(done.map(i => i.id)).toEqual([a.id])
  })

  it('lists by batch', async () => {
    const other = await createBatch({ name: 'other', collection: 'products', tags: [], tenant: 't' })
    await addItem({ file: fakeFile('in-a'), batchId, collection: 'media' })
    await addItem({ file: fakeFile('in-b'), batchId: other.id, collection: 'products' })
    const first = await listItems({ batchId })
    expect(first).toHaveLength(1)
    expect(first[0].collection).toBe('media')
  })
})

describe('status transitions', () => {
  let batchId: string
  beforeEach(async () => {
    await wipeDb()
    const b = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    batchId = b.id
  })
  afterEach(wipeDb)

  it('pending → uploading → done', async () => {
    const item = await addItem({ file: fakeFile('z'), batchId, collection: 'media' })
    await markUploading(item.id)
    const mid = await getItem(item.id)
    expect(mid?.status).toBe('uploading')
    await markDone(item.id, 42)
    const end = await getItem(item.id)
    expect(end?.status).toBe('done')
    expect(end?.remoteMediaId).toBe(42)
    expect(end?.uploadedAt).toBeGreaterThan(0)
  })

  it('error increments attempts and schedules nextRetryAt in the future', async () => {
    const item = await addItem({ file: fakeFile('err'), batchId, collection: 'media' })
    const before = Date.now()
    await markError(item.id, 'network timeout')
    const after = await getItem(item.id)
    expect(after?.status).toBe('error')
    expect(after?.attempts).toBe(1)
    expect(after?.lastError).toBe('network timeout')
    expect(after?.nextRetryAt).toBeGreaterThan(before)
  })

  it('truncates very long error messages to 500 chars', async () => {
    const item = await addItem({ file: fakeFile('q'), batchId, collection: 'media' })
    await markError(item.id, 'x'.repeat(5000))
    const after = await getItem(item.id)
    expect(after?.lastError?.length).toBe(500)
  })

  it('retryItem clears error and returns to pending', async () => {
    const item = await addItem({ file: fakeFile('r'), batchId, collection: 'media' })
    await markError(item.id, 'boom')
    await retryItem(item.id)
    const after = await getItem(item.id)
    expect(after?.status).toBe('pending')
    expect(after?.lastError).toBeUndefined()
    expect(after?.nextRetryAt).toBeUndefined()
  })

  it('retry keeps attempt counter (so backoff keeps growing)', async () => {
    const item = await addItem({ file: fakeFile('rc'), batchId, collection: 'media' })
    await markError(item.id, 'a')
    await markError(item.id, 'b')
    const after = await getItem(item.id)
    expect(after?.attempts).toBe(2)
  })
})

describe('getUploadable', () => {
  let batchId: string
  beforeEach(async () => {
    await wipeDb()
    const b = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    batchId = b.id
  })
  afterEach(wipeDb)

  it('returns pending items', async () => {
    const a = await addItem({ file: fakeFile('1'), batchId, collection: 'media' })
    const b = await addItem({ file: fakeFile('2'), batchId, collection: 'media' })
    const ready = await getUploadable()
    expect(ready.map(r => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('excludes done and in-flight items', async () => {
    const a = await addItem({ file: fakeFile('a'), batchId, collection: 'media' })
    const b = await addItem({ file: fakeFile('b'), batchId, collection: 'media' })
    const c = await addItem({ file: fakeFile('c'), batchId, collection: 'media' })
    await markUploading(a.id)
    await markDone(b.id)
    const ready = await getUploadable()
    expect(ready.map(r => r.id)).toEqual([c.id])
  })

  it('includes error items whose backoff has elapsed', async () => {
    const a = await addItem({ file: fakeFile('x'), batchId, collection: 'media' })
    await markError(a.id, 'boom')
    // Manually set nextRetryAt to the past
    await updateItem(a.id, { nextRetryAt: Date.now() - 1000 })
    const ready = await getUploadable()
    expect(ready.map(r => r.id)).toContain(a.id)
  })

  it('excludes error items still in backoff window', async () => {
    const a = await addItem({ file: fakeFile('x'), batchId, collection: 'media' })
    await markError(a.id, 'boom')
    // Fresh error — nextRetryAt is in the future
    const ready = await getUploadable()
    expect(ready.map(r => r.id)).not.toContain(a.id)
  })

  it('respects the limit', async () => {
    for (let i = 0; i < 10; i++) {
      await addItem({ file: fakeFile(`item-${i}`), batchId, collection: 'media' })
    }
    const ready = await getUploadable(3)
    expect(ready).toHaveLength(3)
  })

  it('orders by createdAt ascending (oldest first)', async () => {
    const a = await addItem({ file: fakeFile('a'), batchId, collection: 'media' })
    await new Promise(r => setTimeout(r, 5))
    const b = await addItem({ file: fakeFile('b'), batchId, collection: 'media' })
    const ready = await getUploadable()
    expect(ready[0].id).toBe(a.id)
    expect(ready[1].id).toBe(b.id)
  })
})

describe('stats', () => {
  let batchId: string
  beforeEach(async () => {
    await wipeDb()
    const b = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    batchId = b.id
  })
  afterEach(wipeDb)

  it('counts each status correctly', async () => {
    const a = await addItem({ file: fakeFile('a'), batchId, collection: 'media' })
    const b = await addItem({ file: fakeFile('b'), batchId, collection: 'media' })
    const c = await addItem({ file: fakeFile('c'), batchId, collection: 'media' })
    const d = await addItem({ file: fakeFile('d'), batchId, collection: 'media' })
    await markUploading(a.id)
    await markDone(b.id)
    await markError(c.id, 'x')
    // d is pending
    void d
    const s = await getStats()
    expect(s.total).toBe(4)
    expect(s.pending).toBe(1)
    expect(s.uploading).toBe(1)
    expect(s.done).toBe(1)
    expect(s.error).toBe(1)
  })

  it('sums bytes into totalBytes and pendingBytes', async () => {
    // Blob sizes: 1, 22, 333 bytes
    const tiny = new File(['a'], 'tiny.bin', { type: 'application/octet-stream' })
    const small = new File(['b'.repeat(22)], 'small.bin', { type: 'application/octet-stream' })
    const med = new File(['c'.repeat(333)], 'med.bin', { type: 'application/octet-stream' })
    const iTiny = await addItem({ file: tiny, batchId, collection: 'media' })
    await addItem({ file: small, batchId, collection: 'media' })
    await addItem({ file: med, batchId, collection: 'media' })
    await markDone(iTiny.id)
    const s = await getStats()
    expect(s.totalBytes).toBe(1 + 22 + 333)
    // pendingBytes excludes done
    expect(s.pendingBytes).toBe(22 + 333)
  })
})

describe('recoverStuck', () => {
  beforeEach(wipeDb)
  afterEach(wipeDb)

  it('resets uploading items back to pending', async () => {
    const b = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    const item = await addItem({ file: fakeFile('s'), batchId: b.id, collection: 'media' })
    await markUploading(item.id)
    const n = await recoverStuck()
    expect(n).toBe(1)
    const after = await getItem(item.id)
    expect(after?.status).toBe('pending')
  })

  it('returns 0 when nothing is stuck', async () => {
    expect(await recoverStuck()).toBe(0)
  })
})

describe('purgeDoneItems', () => {
  beforeEach(wipeDb)
  afterEach(wipeDb)

  it('removes done items older than cutoff', async () => {
    const b = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    const a = await addItem({ file: fakeFile('old'), batchId: b.id, collection: 'media' })
    const c = await addItem({ file: fakeFile('new'), batchId: b.id, collection: 'media' })
    await markDone(a.id)
    await markDone(c.id)
    // Age the first one 10 days back
    await updateItem(a.id, { uploadedAt: Date.now() - 10 * 86_400_000 })
    const removed = await purgeDoneItems(7 * 86_400_000)
    expect(removed).toBe(1)
    expect(await getItem(a.id)).toBeUndefined()
    expect(await getItem(c.id)).toBeDefined()
  })

  it('with olderThanMs=0 removes all done items', async () => {
    const b = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    const a = await addItem({ file: fakeFile('one'), batchId: b.id, collection: 'media' })
    const c = await addItem({ file: fakeFile('two'), batchId: b.id, collection: 'media' })
    await markDone(a.id)
    await markDone(c.id)
    const removed = await purgeDoneItems(0)
    expect(removed).toBe(2)
  })

  it('never removes non-done items', async () => {
    const b = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    await addItem({ file: fakeFile('pending'), batchId: b.id, collection: 'media' })
    const removed = await purgeDoneItems(0)
    expect(removed).toBe(0)
  })
})
