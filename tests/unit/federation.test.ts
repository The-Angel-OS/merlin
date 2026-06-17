/**
 * Nimue — Federation library tests.
 *
 * Covers: directory fetch + cache + seed fallback, Endeavor search scoring,
 * well-known probe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FEDERATION_DEFAULTS,
  SEED_DIRECTORY,
  getDirectory,
  probeEndeavor,
  searchEndeavors,
  _resetFederationCacheForTests,
  type DirectoryResponse,
} from '@/lib/federation'

function fakeDirectory(): DirectoryResponse {
  return {
    federationVersion: '1.0',
    endeavors: [
      { slug: 'alpha', name: 'Alpha Co', domain: 'alpha.spacesangels.com', hostedOn: 'spacesangels.com', publicProfile: { category: 'ministry' } },
      { slug: 'beta', name: 'Beta Labs', domain: 'beta.spacesangels.com', hostedOn: 'spacesangels.com', publicProfile: { category: 'small-business', about: 'helps growers' } },
      { slug: 'gamma', name: 'Gamma Grid', domain: 'gamma.spacesangels.com', hostedOn: 'spacesangels.com' },
    ],
    enterprises: [{ domain: 'spacesangels.com', hostsEndeavors: 3, capacityHint: 'green' }],
  }
}

describe('searchEndeavors', () => {
  const es = fakeDirectory().endeavors

  it('returns all endeavors sorted by name when query empty', () => {
    const results = searchEndeavors(es, '')
    expect(results.map(e => e.slug)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('returns all endeavors when query is whitespace', () => {
    const results = searchEndeavors(es, '   ')
    expect(results).toHaveLength(3)
  })

  it('ranks exact slug match above partial', () => {
    const results = searchEndeavors(es, 'alpha')
    expect(results[0].slug).toBe('alpha')
  })

  it('ranks slug prefix matches', () => {
    const results = searchEndeavors(es, 'bet')
    expect(results[0].slug).toBe('beta')
  })

  it('matches name substrings', () => {
    const results = searchEndeavors(es, 'labs')
    expect(results.map(e => e.slug)).toContain('beta')
  })

  it('matches category and about text', () => {
    const results = searchEndeavors(es, 'growers')
    expect(results[0].slug).toBe('beta')
  })

  it('returns empty on no match', () => {
    expect(searchEndeavors(es, 'zzzzz')).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(searchEndeavors(es, 'ALPHA')[0].slug).toBe('alpha')
  })
})

describe('getDirectory', () => {
  beforeEach(async () => {
    await _resetFederationCacheForTests()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches fresh directory from the network on first call', async () => {
    const body = fakeDirectory()
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    )
    const dir = await getDirectory()
    expect(spy).toHaveBeenCalledWith(
      FEDERATION_DEFAULTS.directoryUrl,
      expect.any(Object),
    )
    expect(dir.endeavors).toHaveLength(3)
    expect(dir.degraded).toBeFalsy()
    expect(dir.fetchedAt).toBeTypeOf('number')
  })

  it('uses cached directory on subsequent calls within TTL', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(fakeDirectory()), { status: 200 })),
    )
    await getDirectory()
    await getDirectory()
    await getDirectory()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('forceRefresh bypasses cache', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(fakeDirectory()), { status: 200 })),
    )
    await getDirectory()
    await getDirectory({ forceRefresh: true })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('falls back to SEED directory on network error with no cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const dir = await getDirectory()
    expect(dir.degraded).toBe(true)
    expect(dir.endeavors.map(e => e.slug)).toEqual(
      SEED_DIRECTORY.endeavors.map(e => e.slug),
    )
  })

  it('falls back to stale cache on network error when cache exists', async () => {
    const body = fakeDirectory()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 }),
    )
    await getDirectory()
    // Now simulate network error on forced refresh.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const dir = await getDirectory({ forceRefresh: true })
    expect(dir.degraded).toBe(true)
    expect(dir.endeavors).toHaveLength(3)
  })

  it('marks degraded on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('server error', { status: 500 }),
    )
    const dir = await getDirectory()
    expect(dir.degraded).toBe(true)
  })

  it('defensively normalizes missing fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    )
    const dir = await getDirectory()
    expect(dir.endeavors).toEqual([])
    expect(dir.enterprises).toEqual([])
    expect(dir.federationVersion).toBe('1.0')
  })
})

describe('probeEndeavor', () => {
  beforeEach(async () => {
    await _resetFederationCacheForTests()
  })
  afterEach(() => vi.restoreAllMocks())

  it('fetches the /.well-known manifest by domain', async () => {
    const manifest = {
      endeavorSlug: 'helpdna',
      endeavorName: 'HelpDNA',
      enterpriseDomain: 'spacesangels.com',
      federationVersion: '1.0',
      authStyle: 'payload-session',
      loginUrl: '/admin/login',
      capabilities: ['leo', 'bookings'],
    }
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(manifest), { status: 200 }),
    )
    const m = await probeEndeavor({ domain: 'helpdna.spacesangels.com' })
    expect(spy).toHaveBeenCalledWith(
      'https://helpdna.spacesangels.com/.well-known/angel-os',
      expect.any(Object),
    )
    expect(m.endeavorSlug).toBe('helpdna')
    expect(m.capabilities).toContain('leo')
  })

  it('resolves slug → domain via directory when given a slug', async () => {
    // First fetch seeds the cache with a directory.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(fakeDirectory()), { status: 200 }),
    )
    // Probe itself.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        endeavorSlug: 'alpha',
        endeavorName: 'Alpha Co',
        enterpriseDomain: 'spacesangels.com',
        federationVersion: '1.0',
        authStyle: 'payload-session',
        loginUrl: '/admin/login',
        capabilities: [],
      }), { status: 200 }),
    )
    const m = await probeEndeavor({ slug: 'alpha' })
    expect(m.endeavorName).toBe('Alpha Co')
  })

  it('throws on unknown slug', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fakeDirectory()), { status: 200 }),
    )
    await expect(probeEndeavor({ slug: 'zzzz-no-match' })).rejects.toThrow(/Unknown Endeavor/)
  })

  it('throws on non-2xx probe response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not found', { status: 404 }),
    )
    await expect(probeEndeavor({ domain: 'nothere.spacesangels.com' })).rejects.toThrow(/HTTP 404/)
  })
})
