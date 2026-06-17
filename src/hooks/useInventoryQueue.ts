'use client'
/**
 * useInventoryQueue — subscribe a component to queue changes.
 *
 * Polls every 2s + listens for `nimue:uploader` events so the UI
 * refreshes the moment an upload starts/finishes.
 */
import { useEffect, useState, useCallback } from 'react'
import { getStats, listItems, type InventoryItem, type QueueStats } from '@/lib/inventoryQueue'

const POLL_MS = 2_000

export function useInventoryQueue(opts: { batchId?: string } = {}) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [stats, setStats] = useState<QueueStats>({
    total: 0, pending: 0, uploading: 0, done: 0, error: 0,
    totalBytes: 0, pendingBytes: 0,
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [nextItems, nextStats] = await Promise.all([
        listItems({ batchId: opts.batchId }),
        getStats(),
      ])
      setItems(nextItems)
      setStats(nextStats)
    } catch {
      // IndexedDB may be unavailable (SSR, private mode) — leave defaults
    } finally {
      setLoading(false)
    }
  }, [opts.batchId])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, POLL_MS)
    const onUp = () => refresh()
    if (typeof window !== 'undefined') {
      window.addEventListener('nimue:uploader', onUp)
    }
    return () => {
      clearInterval(iv)
      if (typeof window !== 'undefined') {
        window.removeEventListener('nimue:uploader', onUp)
      }
    }
  }, [refresh])

  return { items, stats, loading, refresh }
}
