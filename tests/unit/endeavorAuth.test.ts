/**
 * Nimue — EndeavorAuth tests.
 *
 * Covers: login → session stored + active; logout → active rotates to next
 * session; multi-Endeavor switching (no network); JWT decode + expiry;
 * refresh flow; event emission.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  login,
  logout,
  switchTo,
  refresh,
  getActiveSession,
  getActiveSlug,
  getSession,
  listSessions,
  isExpired,
  decodeJwtPayload,
  jwtExpiresAt,
  authHeaders,
  onAuthEvent,
  _resetAuthForTests,
  type EndeavorSession,
} from '@/lib/endeavorAuth'

// Build a fake JWT (valid base64 segments only — we don't verify signatures).
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600

beforeEach(async () => {
  await _resetAuthForTests()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const jwt = fakeJwt({ sub: 'user-1', exp: FUTURE_EXP })
    const p = decodeJwtPayload(jwt)
    expect(p?.sub).toBe('user-1')
    expect(p?.exp).toBe(FUTURE_EXP)
  })

  it('returns null on malformed JWT', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
    expect(decodeJwtPayload('a.b')).toBeNull()
  })

  it('returns null on non-JSON payload', () => {
    expect(decodeJwtPayload('aaa.!!!invalid!!!.ccc')).toBeNull()
  })
})

describe('jwtExpiresAt / isExpired', () => {
  it('pulls `exp` out of the JWT in ms', () => {
    const jwt = fakeJwt({ exp: FUTURE_EXP })
    expect(jwtExpiresAt(jwt)).toBe(FUTURE_EXP * 1000)
  })

  it('falls back to +7d when exp is missing', () => {
    const jwt = fakeJwt({ sub: 'x' })
    const at = jwtExpiresAt(jwt)
    const sevenDays = 7 * 86_400_000
    expect(at).toBeGreaterThan(Date.now() + sevenDays - 1000)
  })

  it('isExpired true for past exp', () => {
    const session: EndeavorSession = {
      slug: 's', name: 's', domain: 's.test', jwt: '', user: { id: 1, email: 'x' },
      expiresAt: Date.now() - 1000, lastVerifiedAt: 0,
    }
    expect(isExpired(session)).toBe(true)
  })

  it('isExpired false for future exp with clock skew', () => {
    const session: EndeavorSession = {
      slug: 's', name: 's', domain: 's.test', jwt: '', user: { id: 1, email: 'x' },
      expiresAt: Date.now() + 5 * 60_000, lastVerifiedAt: 0,
    }
    expect(isExpired(session)).toBe(false)
  })
})

describe('login', () => {
  it('stores a session and sets it active on 2xx', async () => {
    const jwt = fakeJwt({ exp: FUTURE_EXP, sub: 'user-1' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        token: jwt,
        user: { id: 1, email: 'kenny@angels-os.com', name: 'Kenny' },
        exp: FUTURE_EXP,
      }), { status: 200 }),
    )
    const s = await login({ slug: 'helpdna', domain: 'helpdna.spacesangels.com', email: 'kenny@angels-os.com', password: 'secret' })
    expect(s.slug).toBe('helpdna')
    expect(s.user.email).toBe('kenny@angels-os.com')
    expect(s.expiresAt).toBe(FUTURE_EXP * 1000)

    expect(await getActiveSlug()).toBe('helpdna')
    expect((await getActiveSession())?.jwt).toBe(jwt)
  })

  it('throws on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad creds', { status: 401 }),
    )
    await expect(
      login({ slug: 'x', domain: 'x.test', email: 'a@b', password: 'p' }),
    ).rejects.toThrow(/Login failed \(HTTP 401\)/)
  })

  it('throws when response is missing token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 1, email: 'x' } }), { status: 200 }),
    )
    await expect(
      login({ slug: 'x', domain: 'x.test', email: 'a@b', password: 'p' }),
    ).rejects.toThrow(/missing token/)
  })

  it('emits login event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        token: fakeJwt({ exp: FUTURE_EXP }),
        user: { id: 1, email: 'x' },
        exp: FUTURE_EXP,
      }), { status: 200 }),
    )
    const events: string[] = []
    const off = onAuthEvent(ev => events.push(ev.type))
    await login({ slug: 'helpdna', domain: 'helpdna.spacesangels.com', email: 'a@b', password: 'p' })
    off()
    expect(events).toContain('login')
  })
})

describe('multi-Endeavor sessions', () => {
  async function seedTwo() {
    const jwt = fakeJwt({ exp: FUTURE_EXP })
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({
        token: jwt,
        user: { id: 1, email: 'k@a' },
        exp: FUTURE_EXP,
      }), { status: 200 })),
    )
    await login({ slug: 'helpdna', domain: 'helpdna.spacesangels.com', email: 'a', password: 'b' })
    await login({ slug: 'hayescactusfarm', domain: 'hayescactusfarm.spacesangels.com', email: 'a', password: 'b' })
  }

  it('listSessions returns all signed-in Endeavors', async () => {
    await seedTwo()
    const sessions = await listSessions()
    expect(sessions.map(s => s.slug).sort()).toEqual(['hayescactusfarm', 'helpdna'])
  })

  it('active is the most recently logged-in by default', async () => {
    await seedTwo()
    expect(await getActiveSlug()).toBe('hayescactusfarm')
  })

  it('switchTo flips active with no network call', async () => {
    await seedTwo()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockClear()
    const s = await switchTo('helpdna')
    expect(s.slug).toBe('helpdna')
    expect(await getActiveSlug()).toBe('helpdna')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('switchTo throws on unknown slug', async () => {
    await seedTwo()
    await expect(switchTo('nonexistent')).rejects.toThrow(/No session/)
  })

  it('logout rotates active to next remembered session', async () => {
    await seedTwo()
    // active = hayescactusfarm
    await logout('hayescactusfarm')
    expect(await getActiveSlug()).toBe('helpdna')
  })

  it('logout clears active when last session is removed', async () => {
    await seedTwo()
    await logout('hayescactusfarm')
    await logout('helpdna')
    expect(await getActiveSlug()).toBeUndefined()
    expect(await listSessions()).toEqual([])
  })

  it('logout is harmless for unknown slug', async () => {
    await seedTwo()
    await expect(logout('nonexistent')).resolves.toBeUndefined()
    expect(await listSessions()).toHaveLength(2)
  })

  it('emits switched + logout events', async () => {
    await seedTwo()
    const events: string[] = []
    const off = onAuthEvent(ev => events.push(ev.type))
    await switchTo('helpdna')
    await logout('helpdna')
    off()
    expect(events).toContain('switched')
    expect(events).toContain('logout')
  })
})

describe('refresh', () => {
  async function seedOne() {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        token: fakeJwt({ exp: FUTURE_EXP }),
        user: { id: 1, email: 'x' },
        exp: FUTURE_EXP,
      }), { status: 200 }),
    )
    await login({ slug: 'helpdna', domain: 'helpdna.spacesangels.com', email: 'a', password: 'b' })
  }

  it('updates the stored JWT on successful refresh', async () => {
    await seedOne()
    const newExp = FUTURE_EXP + 3600
    const newJwt = fakeJwt({ exp: newExp })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ refreshedToken: newJwt, exp: newExp }), { status: 200 }),
    )
    const s = await refresh('helpdna')
    expect(s.jwt).toBe(newJwt)
    expect(s.expiresAt).toBe(newExp * 1000)
  })

  it('emits expired event on refresh failure', async () => {
    await seedOne()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('gone', { status: 401 }),
    )
    const events: string[] = []
    const off = onAuthEvent(ev => events.push(ev.type))
    await expect(refresh('helpdna')).rejects.toThrow()
    off()
    expect(events).toContain('expired')
  })

  it('throws on unknown slug', async () => {
    await expect(refresh('nope')).rejects.toThrow(/No session/)
  })
})

describe('authHeaders', () => {
  it('returns JWT header for known session', async () => {
    const jwt = fakeJwt({ exp: FUTURE_EXP })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        token: jwt, user: { id: 1, email: 'x' }, exp: FUTURE_EXP,
      }), { status: 200 }),
    )
    await login({ slug: 'helpdna', domain: 'helpdna.spacesangels.com', email: 'a', password: 'b' })
    const h = await authHeaders('helpdna')
    expect(h.Authorization).toBe(`JWT ${jwt}`)
  })

  it('returns empty headers for unknown session', async () => {
    expect(await authHeaders('nope')).toEqual({})
  })
})
