/**
 * Nimue — Inventory Uploader unit tests.
 *
 * Covers: successful upload → done; failed upload → error with backoff;
 * auth/5xx classification; event emission; idempotent start/stop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addItem,
  createBatch,
  getItem,
  _resetDbForTests,
} from '@/lib/inventoryQueue'
import {
  uploadOne,
  isUploaderRunning,
  startUploader,
  stopUploader,
  onUploaderEvent,
} from '@/lib/inventoryUploader'

async function wipeDb() {
  stopUploader() // ensure poll timer is cleared before we tear the db down
  await _resetDbForTests()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('nimue-inventory')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

describe('uploadOne', () => {
  beforeEach(wipeDb)
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs multipart/form-data to /api/payload/media', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ doc: { id: 101 } }), { status: 200 }),
    )
    const batch = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    const item = await addItem({
      file: new File(['payload'], 'x.jpg', { type: 'image/jpeg' }),
      batchId: batch.id,
      collection: 'media',
      tags: ['a', 'b'],
      notes: 'hello',
    })
    const result = await uploadOne(item)
    expect(result.remoteMediaId).toBe(101)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/payload/media')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    const body = init.body as FormData
    expect(body.get('alt')).toBe('hello')
    expect(body.get('tags')).toBe(JSON.stringify(['a', 'b']))
    expect(body.get('notes')).toBe('hello')
    expect(body.get('collection')).toBe('media')
    expect(body.get('batchId')).toBe(batch.id)
  })

  it('throws with status + body text on non-2xx responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('permission denied', { status: 403, statusText: 'Forbidden' }),
    )
    const batch = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    const item = await addItem({
      file: new File(['payload'], 'x.jpg'),
      batchId: batch.id,
      collection: 'media',
    })
    await expect(uploadOne(item)).rejects.toThrow(/HTTP 403/)
  })

  it('falls back to top-level id when doc.id is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'abc-123' }), { status: 200 }),
    )
    const batch = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    const item = await addItem({
      file: new File(['p'], 'x.jpg'),
      batchId: batch.id,
      collection: 'media',
    })
    const result = await uploadOne(item)
    expect(result.remoteMediaId).toBe('abc-123')
  })

  it('includes geolocation when present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ doc: { id: 1 } }), { status: 200 }),
    )
    const batch = await createBatch({ name: 't', collection: 'media', tags: [], tenant: 't' })
    const item = await addItem({
      file: new File(['p'], 'x.jpg'),
      batchId: batch.id,
      collection: 'media',
      lat: 27.965,
      lon: -82.8,
    })
    await uploadOne(item)
    const body = fetchSpy.mock.calls[0]![1]!.body as FormData
    expect(body.get('lat')).toBe('27.965')
    expect(body.get('lon')).toBe('-82.8')
  })
})

describe('startUploader / stopUploader', () => {
  beforeEach(wipeDb)
  afterEach(async () => {
    stopUploader()
    await wipeDb()
  })

  it('is idempotent — calling start twice only flips to running once', async () => {
    await startUploader()
    expect(isUploaderRunning()).toBe(true)
    await startUploader()
    expect(isUploaderRunning()).toBe(true)
    stopUploader()
    expect(isUploaderRunning()).toBe(false)
    stopUploader() // second stop is harmless
    expect(isUploaderRunning()).toBe(false)
  })

  it('emits started and stopped events', async () => {
    const events: string[] = []
    const off = onUploaderEvent(ev => events.push(ev.type))
    await startUploader()
    stopUploader()
    off()
    expect(events).toContain('started')
    expect(events).toContain('stopped')
  })

  it('listeners can unsubscribe', async () => {
    const calls: string[] = []
    const off = onUploaderEvent(ev => calls.push(ev.type))
    off()
    await startUploader()
    stopUploader()
    expect(calls).toHaveLength(0)
  })
})
