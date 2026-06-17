'use client'
/**
 * useConnection — React hook for Nimue's federation connection state.
 *
 * Owns a small state machine:
 *
 *   idle ──► discovering ──► connected
 *    ▲            │             │
 *    └────────────┴─── error ◄──┘
 *
 * Exposes the active Endeavor session, the remembered sessions list, the
 * federation directory, and the primary actions (login / logout / switch).
 * Subscribes to `nimue:auth` so UI refreshes instantly on auth changes.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getDirectory,
  searchEndeavors,
  type DirectoryResponse,
  type EndeavorRef,
} from '@/lib/federation'
import {
  getActiveSession,
  listSessions,
  login as doLogin,
  logout as doLogout,
  switchTo as doSwitch,
  type EndeavorSession,
  type LoginInput,
} from '@/lib/endeavorAuth'

export type ConnectionState =
  | 'idle'
  | 'discovering'
  | 'authenticating'
  | 'connected'
  | 'error'

export interface UseConnectionValue {
  state: ConnectionState
  directory: DirectoryResponse | null
  directoryLoading: boolean
  directoryError: string | null
  active: EndeavorSession | null
  sessions: EndeavorSession[]
  search: (q: string) => EndeavorRef[]
  refreshDirectory: () => Promise<void>
  login: (input: LoginInput) => Promise<EndeavorSession>
  logout: (slug: string) => Promise<void>
  switchTo: (slug: string) => Promise<EndeavorSession>
}

export function useConnection(): UseConnectionValue {
  const [directory, setDirectory] = useState<DirectoryResponse | null>(null)
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [active, setActive] = useState<EndeavorSession | null>(null)
  const [sessions, setSessions] = useState<EndeavorSession[]>([])
  const [authState, setAuthState] = useState<'idle' | 'authenticating' | 'error'>(
    'idle',
  )

  const refreshAuth = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([getActiveSession(), listSessions()])
      setActive(a ?? null)
      setSessions(s)
    } catch {
      // storage unavailable — leave defaults
    }
  }, [])

  const refreshDirectory = useCallback(async () => {
    setDirectoryLoading(true)
    setDirectoryError(null)
    try {
      const d = await getDirectory()
      setDirectory(d)
    } catch (err) {
      setDirectoryError(err instanceof Error ? err.message : String(err))
    } finally {
      setDirectoryLoading(false)
    }
  }, [])

  // Initial load + auth subscription.
  useEffect(() => {
    refreshAuth()
    refreshDirectory()
    const onAuth = () => refreshAuth()
    if (typeof window !== 'undefined') {
      window.addEventListener('nimue:auth', onAuth)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('nimue:auth', onAuth)
      }
    }
  }, [refreshAuth, refreshDirectory])

  // Derived connection state — `connected` wins over everything.
  const state: ConnectionState = active
    ? 'connected'
    : authState === 'authenticating'
      ? 'authenticating'
      : authState === 'error'
        ? 'error'
        : directoryLoading
          ? 'discovering'
          : 'idle'

  const search = useCallback(
    (q: string) => searchEndeavors(directory?.endeavors ?? [], q),
    [directory],
  )

  const login = useCallback(async (input: LoginInput) => {
    setAuthState('authenticating')
    try {
      const session = await doLogin(input)
      setAuthState('idle')
      await refreshAuth()
      return session
    } catch (err) {
      setAuthState('error')
      throw err
    }
  }, [refreshAuth])

  const logout = useCallback(async (slug: string) => {
    await doLogout(slug)
    await refreshAuth()
  }, [refreshAuth])

  const switchTo = useCallback(async (slug: string) => {
    const s = await doSwitch(slug)
    await refreshAuth()
    return s
  }, [refreshAuth])

  return {
    state,
    directory,
    directoryLoading,
    directoryError,
    active,
    sessions,
    search,
    refreshDirectory,
    login,
    logout,
    switchTo,
  }
}
