/**
 * GET /api/directory — Merlin's same-origin federation proxy.
 *
 * The browser can't fetch spacesangels.com's federation endpoints directly:
 * they don't send Access-Control-Allow-Origin for Merlin's origin, so a
 * client-side fetch is CORS-blocked. This route fetches them SERVER-side
 * (no CORS) and normalizes the two upstream shapes into the one
 * DirectoryResponse the client already understands:
 *
 *   - GET /api/federation/holons   → the endeavor directory (root node)
 *   - GET /api/federation-peers    → the Enterprise/Diocese roster (+ gossiped
 *                                     peer endeavors), so the browser sees the
 *                                     FULL federation, not just the root node.
 */
import { NextResponse } from 'next/server'
import type { DirectoryResponse, EndeavorRef, EnterpriseRef } from '@/lib/federation'

const ROOT =
  process.env.NEXT_PUBLIC_FEDERATION_ROOT_URL || 'https://www.payloadnuke.com'
// Derive the registrable root domain from ROOT so it always tracks the configured
// federation root (payloadnuke.com self-host, or spacesangels.com legacy).
const ROOT_DOMAIN = (() => {
  try {
    return new URL(ROOT).hostname.replace(/^www\./, '')
  } catch {
    return 'payloadnuke.com'
  }
})()
const TIMEOUT_MS = 12_000

export async function GET() {
  try {
    const [holons, peers] = await Promise.all([
      fetchJson(`${ROOT}/api/federation/holons?limit=100`),
      fetchJson(`${ROOT}/api/federation-peers?limit=50&depth=0`),
    ])

    const rootEndeavors: EndeavorRef[] = Array.isArray(holons?.holons)
      ? holons.holons.map((h: any) => mapHolon(h))
      : []

    const peerDocs: any[] = Array.isArray(peers?.docs) ? peers.docs : []
    const peerEndeavors: EndeavorRef[] = peerDocs.flatMap((p) =>
      (Array.isArray(p?.endeavors) ? p.endeavors : []).map((e: any) =>
        mapPeerEndeavor(e, p),
      ),
    )

    // Enterprises = the root node + every active peer Diocese.
    const enterprises: EnterpriseRef[] = [
      {
        id: 'root',
        domain: ROOT_DOMAIN,
        name: 'Angel OS Foundation',
        ministryStatus: 'active',
        hostsEndeavors: rootEndeavors.length,
        capacityHint: 'green',
      },
      ...peerDocs.map((p) => mapPeerEnterprise(p)),
    ]

    const endeavors = dedupeBySlug([...rootEndeavors, ...peerEndeavors])

    const body: DirectoryResponse = {
      federationVersion: holons?.federationVersion ?? '1.0',
      endeavors,
      enterprises,
      fetchedAt: Date.now(),
    }
    return NextResponse.json(body)
  } catch (err) {
    // Surface the failure so the client falls back to its own cache/seed.
    return NextResponse.json(
      { error: 'directory upstream unreachable', detail: String(err) },
      { status: 502 },
    )
  }
}

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

// ─── Mappers ────────────────────────────────────────────────────────────────

/** holon (federation/holons) → EndeavorRef */
function mapHolon(h: any): EndeavorRef {
  const domain =
    hostOf(h?.storefrontUrl) ||
    publicDomain(h?.tenant?.domain) ||
    `${slugOf(h)}.${ROOT_DOMAIN}`
  return {
    slug: slugOf(h),
    name: h?.name || h?.tenant?.siteName || 'Unnamed Endeavor',
    domain,
    hostedOn: ROOT_DOMAIN,
    enterpriseId: h?.federation?.federationId || 'root',
    avatarUrl: abs(h?.logo) || undefined,
    publicProfile: {
      category: h?.endeavorType || undefined,
      about: h?.tagline || h?.description || undefined,
      heroUrl: abs(h?.coverImage) || undefined,
    },
    capabilities: mapCapabilities(h?.capabilities),
  }
}

/** gossiped peer endeavor (federation-peers[].endeavors[]) → EndeavorRef */
function mapPeerEndeavor(e: any, peer: any): EndeavorRef {
  const slug =
    e?.tenant?.slug || slugify(e?.name) || `peer-${e?.id ?? 'x'}`
  return {
    slug,
    name: e?.name || 'Unnamed Endeavor',
    domain: hostOf(e?.storefrontUrl) || e?.tenant?.domain || peer?.domain || '',
    hostedOn: peer?.domain || 'federation',
    enterpriseId: peer?.federationId || e?.federation?.federationId,
    publicProfile: {
      category: e?.endeavorType || undefined,
      about: e?.tagline || e?.description || undefined,
    },
  }
}

/** federation-peers doc → EnterpriseRef */
function mapPeerEnterprise(p: any): EnterpriseRef {
  const status = p?.ministryStatus as string | undefined
  return {
    id: p?.federationId || p?.id,
    domain: p?.domain || '',
    name: p?.name || p?.domain || 'Unknown Enterprise',
    ministryStatus: status,
    hostsEndeavors: Array.isArray(p?.endeavors) ? p.endeavors.length : undefined,
    capacityHint:
      status === 'active' ? 'green' : status === 'suspended' || status === 'revoked' ? 'red' : 'amber',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mapCapabilities(caps: any): string[] | undefined {
  if (!Array.isArray(caps) || caps.length === 0) return undefined
  const skills = caps
    .map((c) => (typeof c === 'string' ? c : c?.skill))
    .filter(Boolean) as string[]
  return skills.length ? skills : undefined
}

function slugOf(h: any): string {
  return h?.tenant?.slug || slugify(h?.name) || `holon-${h?.id ?? 'x'}`
}

function slugify(s?: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Reject non-routable internal domains (.local/.localhost/.internal). */
function publicDomain(d?: string): string {
  if (!d) return ''
  return /\.(local|localhost|internal)$/i.test(d) ? '' : d
}

function hostOf(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** Absolutize a relative media path (/api/media/...) against the root node. */
function abs(path?: string | null): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${ROOT}${path.startsWith('/') ? '' : '/'}${path}`
}

function dedupeBySlug(list: EndeavorRef[]): EndeavorRef[] {
  const seen = new Set<string>()
  const out: EndeavorRef[] = []
  for (const e of list) {
    if (seen.has(e.slug)) continue
    seen.add(e.slug)
    out.push(e)
  }
  return out
}
