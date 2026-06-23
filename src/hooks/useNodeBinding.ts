'use client'
/**
 * useNodeBinding — this Merlin node's lock-on state + the config-free lock action.
 *
 * One source of truth for "which endeavor is this machine bound to" and "lock it
 * onto one." Used by the /connect grid (cards act as a live selector) and the
 * NodeLockOn control. Node registration uses NODE_REGISTER_KEY, not a human login.
 */
import { useCallback, useEffect, useState } from 'react'

export type NodeBinding = {
  boundEndeavor: string
  boundAngelsUrl?: string
  busChannel: string
  busSpaceId?: string
  hasToken: boolean
}

export function useNodeBinding() {
  const [binding, setBinding] = useState<NodeBinding | null>(null)
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/node/register', { method: 'GET' })
      if (r.ok) setBinding((await r.json()) as NodeBinding)
    } catch {
      /* binding status is non-critical */
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const lockOn = useCallback(
    async (slug: string, domain: string) => {
      setBusySlug(slug)
      setError(null)
      try {
        const r = await fetch('/api/node/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endeavor: slug, angelsUrl: `https://${domain}` }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) {
          setError(typeof d?.error === 'string' ? d.error : `register failed (${r.status})`)
          return false
        }
        await refresh()
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'register failed')
        return false
      } finally {
        setBusySlug(null)
      }
    },
    [refresh],
  )

  const lockedSlug = binding?.hasToken ? binding.boundEndeavor : ''
  return { binding, lockedSlug, busySlug, error, lockOn, refresh }
}
