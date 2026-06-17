/**
 * Nimue — Federation Directory & Endeavor Discovery
 *
 * The federation root is spacesangels.com. Endeavors live at
 * {slug}.spacesangels.com. This module:
 *
 *   1. Fetches the directory (cached 6h)
 *   2. Probes an Endeavor's /.well-known/angel-os manifest
 *   3. Searches Endeavors client-side
 *   4. Falls back to a bundled seed directory when offline/degraded
 *
 * Design notes:
 *   - Maximum transparency — directory is public, no auth needed
 *   - Endeavor-first — users pick sites, not servers
 *   - Feature flag: NEXT_PUBLIC_FEDERATION_ENABLED
 *   - Directory override: NEXT_PUBLIC_FEDERATION_DIRECTORY_URL
 */

import { storage } from './storage'

// ─── Constants ──────────────────────────────────────────────────────────────

export const FEDERATION_DEFAULTS = {
  directoryUrl:
    typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_FEDERATION_DIRECTORY_URL
      ? process.env.NEXT_PUBLIC_FEDERATION_DIRECTORY_URL
      : 'https://www.spacesangels.com/api/federation/directory',
  wellKnownPath: '/.well-known/angel-os',
  authLoginPath: '/api/federation/auth-login',
  authRefreshPath: '/api/federation/auth-refresh',
  // Re-fetch directory every 6h.
  cacheTtlMs: 6 * 60 * 60 * 1000,
}

const STORAGE_KEY_DIRECTORY = 'nimue-federation-directory'
const STORAGE_KEY_DIRECTORY_AT = 'nimue-federation-directory-at'

export function isFederationEnabled(): boolean {
  if (typeof process === 'undefined') return true
  // Default-on in dev, opt-out via env.
  return process.env.NEXT_PUBLIC_FEDERATION_ENABLED !== 'false'
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PublicProfile {
  about?: string
  avatarUrl?: string
  category?: string
  heroUrl?: string
}

export interface EndeavorRef {
  slug: string
  name: string
  domain: string
  hostedOn: string
  enterpriseId?: string
  avatarUrl?: string
  publicProfile?: PublicProfile
  lastSeen?: string
  capabilities?: string[]
}

export interface EnterpriseRef {
  id?: string
  domain: string
  hostsEndeavors?: number
  /** 'green' | 'amber' | 'red' — heartbeat-derived capacity hint. */
  capacityHint?: 'green' | 'amber' | 'red'
}

export interface DirectoryResponse {
  endeavors: EndeavorRef[]
  enterprises: EnterpriseRef[]
  federationVersion: string
  fetchedAt?: number
  /** True when this response came from the seed fallback, not the network. */
  degraded?: boolean
}

export interface EndeavorManifest {
  endeavorSlug: string
  endeavorName: string
  enterpriseDomain: string
  federationVersion: string
  /** Server auth style — Payload sessions in v1. */
  authStyle: 'payload-session' | string
  loginUrl: string
  capabilities: string[]
  publicProfile?: PublicProfile
}

// ─── Seed directory ─────────────────────────────────────────────────────────

/**
 * Bundled seed — the four known Endeavors as of Sprint 44-45.
 * Used as fallback when the network directory is unreachable on first run.
 * Updated lazily from the live directory on successful fetches.
 */
export const SEED_DIRECTORY: DirectoryResponse = {
  federationVersion: '1.0',
  endeavors: [
    {
      slug: 'clearwater-cruisin',
      name: "Clearwater Cruisin' Ministries",
      domain: 'clearwater-cruisin.spacesangels.com',
      hostedOn: 'spacesangels.com',
      publicProfile: { category: 'ministry' },
    },
    {
      slug: 'helpdna',
      name: 'HelpDNA',
      domain: 'helpdna.spacesangels.com',
      hostedOn: 'spacesangels.com',
      publicProfile: { category: 'community-help' },
    },
    {
      slug: 'hayescactusfarm',
      name: 'Hayes Cactus Farm',
      domain: 'hayescactusfarm.spacesangels.com',
      hostedOn: 'spacesangels.com',
      publicProfile: { category: 'small-business' },
    },
    {
      slug: 'tomstalcupforcongress',
      name: 'Tom Stalcup for Congress',
      domain: 'tomstalcupforcongress.spacesangels.com',
      hostedOn: 'spacesangels.com',
      publicProfile: { category: 'campaign' },
    },
  ],
  enterprises: [
    { domain: 'spacesangels.com', hostsEndeavors: 4, capacityHint: 'green' },
  ],
}

// ─── Directory fetch + cache ────────────────────────────────────────────────

/**
 * Get directory, preferring fresh network → cached → seed.
 * Never throws — degraded responses are marked with `degraded: true`.
 */
export async function getDirectory(opts: { forceRefresh?: boolean } = {}): Promise<DirectoryResponse> {
  if (!opts.forceRefresh) {
    const cached = await readCachedDirectory()
    if (cached) return cached
  }

  try {
    const fresh = await fetchDirectoryNetwork()
    await writeCachedDirectory(fresh)
    return fresh
  } catch {
    const stale = await readCachedDirectory({ allowStale: true })
    if (stale) return { ...stale, degraded: true }
    return { ...SEED_DIRECTORY, fetchedAt: Date.now(), degraded: true }
  }
}

async function fetchDirectoryNetwork(): Promise<DirectoryResponse> {
  const res = await fetch(FEDERATION_DEFAULTS.directoryUrl, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json()) as DirectoryResponse
  // Defensive normalization — server might omit `enterprises`.
  return {
    ...body,
    endeavors: Array.isArray(body.endeavors) ? body.endeavors : [],
    enterprises: Array.isArray(body.enterprises) ? body.enterprises : [],
    federationVersion: body.federationVersion ?? '1.0',
    fetchedAt: Date.now(),
  }
}

async function readCachedDirectory(opts: { allowStale?: boolean } = {}): Promise<DirectoryResponse | null> {
  const at = (await storage.get<number>(STORAGE_KEY_DIRECTORY_AT)) ?? 0
  const isFresh = Date.now() - at < FEDERATION_DEFAULTS.cacheTtlMs
  if (!isFresh && !opts.allowStale) return null
  const cached = await storage.get<DirectoryResponse>(STORAGE_KEY_DIRECTORY)
  return cached ?? null
}

async function writeCachedDirectory(dir: DirectoryResponse): Promise<void> {
  await storage.set(STORAGE_KEY_DIRECTORY, dir)
  await storage.set(STORAGE_KEY_DIRECTORY_AT, Date.now())
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Fuzzy-ish search over Endeavor slug, name, and category.
 * Empty/whitespace query → returns all Endeavors sorted by name.
 */
export function searchEndeavors(endeavors: EndeavorRef[], query: string): EndeavorRef[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...endeavors].sort((a, b) => a.name.localeCompare(b.name))

  const scored = endeavors.map(e => {
    const haystack = [
      e.slug,
      e.name,
      e.publicProfile?.category,
      e.publicProfile?.about,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    let score = 0
    if (e.slug.toLowerCase() === q) score += 1000
    if (e.slug.toLowerCase().startsWith(q)) score += 100
    if (e.name.toLowerCase().startsWith(q)) score += 80
    if (haystack.includes(q)) score += 10
    return { e, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.e)
}

// ─── Well-known probe ───────────────────────────────────────────────────────

/**
 * Probe an Endeavor's /.well-known/angel-os manifest. Accepts either a slug
 * (resolved via the current directory) or a full domain.
 */
export async function probeEndeavor(
  target: { slug: string } | { domain: string },
): Promise<EndeavorManifest> {
  let domain: string
  if ('domain' in target) {
    domain = target.domain
  } else {
    const dir = await getDirectory()
    const found = dir.endeavors.find(e => e.slug === target.slug)
    if (!found) throw new Error(`Unknown Endeavor slug: ${target.slug}`)
    domain = found.domain
  }

  const url = `https://${domain}${FEDERATION_DEFAULTS.wellKnownPath}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${domain} returned HTTP ${res.status}`)
  return (await res.json()) as EndeavorManifest
}

// ─── Test helpers ───────────────────────────────────────────────────────────

export async function _resetFederationCacheForTests(): Promise<void> {
  await storage.remove(STORAGE_KEY_DIRECTORY)
  await storage.remove(STORAGE_KEY_DIRECTORY_AT)
}
