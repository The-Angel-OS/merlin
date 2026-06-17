/**
 * Nimue — Endeavor Authentication
 *
 * Mirrors Angel OS Core auth (Payload session/JWT) exactly. Nimue is a remote
 * Payload session holder, not a foreign client. We do not invent a new token
 * format — we store Payload's JWT + cookie and replay them.
 *
 * Multi-Endeavor: Nimue remembers sessions for every Endeavor the user has
 * signed into. Switching is a local state swap — no network.
 *
 *   { endeavorSlug → { jwt, expiresAt, user } }
 *
 * "Active" session is the one last switched to. Directory + probe layer is in
 * federation.ts; this file is only credentials + session state.
 */

import { storage } from './storage'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EndeavorUser {
  id: string | number
  email: string
  name?: string
  roles?: string[]
}

export interface EndeavorSession {
  slug: string
  name: string
  domain: string
  jwt: string
  /** ms epoch — when the JWT expires (from Payload's `exp` claim). */
  expiresAt: number
  user: EndeavorUser
  /** ms epoch — last time we verified this session with the server. */
  lastVerifiedAt: number
}

export interface LoginInput {
  slug: string
  /** Endeavor domain (e.g. `helpdna.spacesangels.com`). Resolved by caller. */
  domain: string
  email: string
  password: string
}

// ─── Storage keys ───────────────────────────────────────────────────────────

const STORAGE_KEY_SESSIONS = 'nimue-endeavor-sessions'
const STORAGE_KEY_ACTIVE = 'nimue-endeavor-active'

// ─── Events ─────────────────────────────────────────────────────────────────

export type AuthEventType =
  | 'login'
  | 'logout'
  | 'switched'
  | 'expired'
  | 'refreshed'

export interface AuthEvent {
  type: AuthEventType
  slug: string
  at: number
}

type AuthListener = (ev: AuthEvent) => void
const listeners = new Set<AuthListener>()

export function onAuthEvent(listener: AuthListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(ev: AuthEvent) {
  for (const l of listeners) {
    try {
      l(ev)
    } catch {
      /* ignore */
    }
  }
  // Also dispatch a DOM CustomEvent so non-React code can subscribe.
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('nimue:auth', { detail: ev }))
    } catch {
      /* ignore */
    }
  }
}

// ─── Session store ──────────────────────────────────────────────────────────

type SessionMap = Record<string, EndeavorSession>

async function readSessions(): Promise<SessionMap> {
  return (await storage.get<SessionMap>(STORAGE_KEY_SESSIONS)) ?? {}
}

async function writeSessions(map: SessionMap): Promise<void> {
  await storage.set(STORAGE_KEY_SESSIONS, map)
}

export async function listSessions(): Promise<EndeavorSession[]> {
  const map = await readSessions()
  return Object.values(map).sort((a, b) => b.lastVerifiedAt - a.lastVerifiedAt)
}

export async function getSession(slug: string): Promise<EndeavorSession | undefined> {
  const map = await readSessions()
  return map[slug]
}

export async function getActiveSlug(): Promise<string | undefined> {
  return storage.get<string>(STORAGE_KEY_ACTIVE)
}

export async function getActiveSession(): Promise<EndeavorSession | undefined> {
  const slug = await getActiveSlug()
  if (!slug) return undefined
  return getSession(slug)
}

// ─── JWT utilities ──────────────────────────────────────────────────────────

/**
 * Decode a JWT's payload without verifying the signature (we trust the
 * transport + the fact the server just issued it). Returns null on any error.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function jwtExpiresAt(jwt: string): number {
  const payload = decodeJwtPayload(jwt)
  const exp = payload?.exp
  if (typeof exp === 'number') return exp * 1000
  // Fallback — assume 7 days (Payload default) if claim missing.
  return Date.now() + 7 * 86_400_000
}

export function isExpired(session: EndeavorSession, clockSkewMs = 60_000): boolean {
  return session.expiresAt - clockSkewMs <= Date.now()
}

// ─── Login / logout / switch ────────────────────────────────────────────────

/**
 * POST credentials to the Endeavor's Payload auth endpoint. Mirrors the
 * `/api/users/login` shape Payload ships with. On 2xx, stashes the session
 * and sets it active.
 */
export async function login(input: LoginInput): Promise<EndeavorSession> {
  const url = `https://${input.domain}/api/users/login`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: input.email, password: input.password }),
    credentials: 'include',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Login failed (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  const body = (await res.json()) as {
    token?: string
    user?: EndeavorUser
    exp?: number
    message?: string
  }
  if (!body.token || !body.user) {
    throw new Error('Auth response missing token or user')
  }

  const session: EndeavorSession = {
    slug: input.slug,
    name: input.slug, // caller may patch with proper name after login
    domain: input.domain,
    jwt: body.token,
    expiresAt: body.exp ? body.exp * 1000 : jwtExpiresAt(body.token),
    user: body.user,
    lastVerifiedAt: Date.now(),
  }

  const map = await readSessions()
  map[input.slug] = session
  await writeSessions(map)
  await storage.set(STORAGE_KEY_ACTIVE, input.slug)
  emit({ type: 'login', slug: input.slug, at: Date.now() })
  return session
}

/**
 * Drop the session for `slug`. If it was the active one, active becomes the
 * next-most-recently-used remaining session (or undefined).
 */
export async function logout(slug: string): Promise<void> {
  const map = await readSessions()
  if (!map[slug]) return
  delete map[slug]
  await writeSessions(map)

  const active = await getActiveSlug()
  if (active === slug) {
    const remaining = Object.values(map).sort(
      (a, b) => b.lastVerifiedAt - a.lastVerifiedAt,
    )
    if (remaining.length) {
      await storage.set(STORAGE_KEY_ACTIVE, remaining[0].slug)
    } else {
      await storage.remove(STORAGE_KEY_ACTIVE)
    }
  }
  emit({ type: 'logout', slug, at: Date.now() })
}

/**
 * Switch active Endeavor. Purely local — no network. Fails if no session
 * exists for the slug.
 */
export async function switchTo(slug: string): Promise<EndeavorSession> {
  const map = await readSessions()
  const session = map[slug]
  if (!session) throw new Error(`No session for ${slug}`)
  await storage.set(STORAGE_KEY_ACTIVE, slug)
  emit({ type: 'switched', slug, at: Date.now() })
  return session
}

/** Refresh a session by hitting Payload's refresh endpoint. */
export async function refresh(slug: string): Promise<EndeavorSession> {
  const session = await getSession(slug)
  if (!session) throw new Error(`No session for ${slug}`)
  const url = `https://${session.domain}/api/users/refresh-token`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `JWT ${session.jwt}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  })
  if (!res.ok) {
    emit({ type: 'expired', slug, at: Date.now() })
    throw new Error(`Refresh failed (HTTP ${res.status})`)
  }
  const body = (await res.json()) as { refreshedToken?: string; exp?: number }
  if (!body.refreshedToken) throw new Error('Refresh response missing token')

  const updated: EndeavorSession = {
    ...session,
    jwt: body.refreshedToken,
    expiresAt: body.exp ? body.exp * 1000 : jwtExpiresAt(body.refreshedToken),
    lastVerifiedAt: Date.now(),
  }
  const map = await readSessions()
  map[slug] = updated
  await writeSessions(map)
  emit({ type: 'refreshed', slug, at: Date.now() })
  return updated
}

/**
 * Build headers to pass Payload's JWT on authenticated requests to the
 * given Endeavor. Returns an empty object if no session exists.
 */
export async function authHeaders(slug: string): Promise<Record<string, string>> {
  const session = await getSession(slug)
  if (!session) return {}
  return { Authorization: `JWT ${session.jwt}` }
}

// ─── Test helpers ───────────────────────────────────────────────────────────

export async function _resetAuthForTests(): Promise<void> {
  await storage.remove(STORAGE_KEY_SESSIONS)
  await storage.remove(STORAGE_KEY_ACTIVE)
  listeners.clear()
}
