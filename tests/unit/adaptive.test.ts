/**
 * Nimue — Adaptive content client tests.
 *
 * Covers: degraded fallback when no active Endeavor; degraded on HTTP error;
 * success path returns server text + cached flag; includes JWT auth header.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adaptContent } from '@/lib/adaptive'
import { login, _resetAuthForTests } from '@/lib/endeavorAuth'

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

beforeEach(async () => {
  await _resetAuthForTests()
})
afterEach(() => vi.restoreAllMocks())

async function signIn() {
  vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() =>
    Promise.resolve(new Response(JSON.stringify({
      token: fakeJwt({ exp: FUTURE_EXP }),
      user: { id: 1, email: 'x@y' },
      exp: FUTURE_EXP,
    }), { status: 200 })),
  )
  await login({ slug: 'helpdna', domain: 'helpdna.spacesangels.com', email: 'a', password: 'b' })
}

describe('adaptContent', () => {
  it('returns degraded fallback when no active Endeavor', async () => {
    const res = await adaptContent(
      { source: { collection: 'posts', id: 1, field: 'content' }, audience: { readingLevel: 'teen' } },
      'original text',
    )
    expect(res.degraded).toBe(true)
    expect(res.text).toBe('original text')
  })

  it('calls the Endeavor adapt endpoint with JWT auth header', async () => {
    await signIn()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockClear()
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({
        text: 'simpler text',
        cached: false,
        invariantsPassed: true,
      }), { status: 200 }),
    )
    const res = await adaptContent(
      { source: { collection: 'posts', id: 1, field: 'content' }, audience: { readingLevel: 'child' } },
      'original',
    )
    expect(res.text).toBe('simpler text')
    expect(res.degraded).toBeFalsy()
    const call = fetchSpy.mock.calls[0]!
    const [url, init] = call as [string, RequestInit]
    expect(url).toBe('https://helpdna.spacesangels.com/api/content-ops/adapt')
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^JWT /)
  })

  it('passes through cached + provenance from server', async () => {
    await signIn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        text: 'cached adapted',
        cached: true,
        invariantsPassed: true,
        provenance: { model: 'haiku', at: '2026-04-18', cacheKey: 'abc123' },
      }), { status: 200 }),
    )
    const res = await adaptContent(
      { source: { collection: 'products', id: 42, field: 'description' }, audience: { tone: 'plain' } },
      'original description',
    )
    expect(res.cached).toBe(true)
    expect(res.provenance?.model).toBe('haiku')
  })

  it('returns degraded on HTTP error', async () => {
    await signIn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 }),
    )
    const res = await adaptContent(
      { source: { collection: 'posts', id: 1, field: 'content' }, audience: {} },
      'original',
    )
    expect(res.degraded).toBe(true)
    expect(res.text).toBe('original')
  })

  it('returns degraded on network failure', async () => {
    await signIn()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const res = await adaptContent(
      { source: { collection: 'posts', id: 1, field: 'content' }, audience: {} },
      'original',
    )
    expect(res.degraded).toBe(true)
    expect(res.text).toBe('original')
  })

  it('returns degraded when server response has no text', async () => {
    await signIn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ cached: false }), { status: 200 }),
    )
    const res = await adaptContent(
      { source: { collection: 'posts', id: 1, field: 'content' }, audience: {} },
      'original',
    )
    expect(res.degraded).toBe(true)
  })

  it('invariantsPassed flag is preserved from server', async () => {
    await signIn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        text: 'rewritten',
        cached: false,
        invariantsPassed: false,
      }), { status: 200 }),
    )
    const res = await adaptContent(
      { source: { collection: 'posts', id: 1, field: 'content' }, audience: {}, invariants: ['Hayes Cactus Farm'] },
      'original with Hayes Cactus Farm',
    )
    expect(res.invariantsPassed).toBe(false)
  })
})
