/**
 * Nimue — Adaptive Content Client
 *
 * Talks to Angel OS Core's `/api/content-ops/adapt` endpoint (Sprint 46
 * on the mothership). Content-addressed + tenant-voice-aware. Used by
 * the <Adaptive> component and anything else that wants on-demand
 * audience-tuned copy.
 *
 * Trajectory: the Young Lady's Illustrated Primer — prose that adapts
 * to the reader (age, tone, locale, expertise) while preserving the
 * invariants the author insists must appear verbatim (prices, SKUs,
 * proper nouns, quotes).
 *
 * Status: stub — points at the server endpoint that Sprint 46 is
 * building. Falls through to the untransformed source on any error
 * so UI never breaks.
 */

import { getActiveSession, authHeaders } from './endeavorAuth'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReadingLevel = 'child' | 'teen' | 'adult' | 'expert'

export interface AdaptAudience {
  readingLevel?: ReadingLevel
  tone?: string
  locale?: string
}

export interface AdaptSource {
  /** Collection slug — e.g. 'posts', 'products', 'books'. */
  collection: string
  /** Document ID. */
  id: string | number
  /** Field on the document to adapt — e.g. 'content', 'description'. */
  field: string
}

export interface AdaptRequest {
  source: AdaptSource
  audience: AdaptAudience
  /** Strings that MUST appear verbatim in the adapted output. */
  invariants?: string[]
  forceRegenerate?: boolean
}

export interface AdaptResponse {
  text: string
  cached: boolean
  /** False when the server could not validate invariants; caller should
   *  consider showing the original unchanged. */
  invariantsPassed: boolean
  provenance?: {
    model?: string
    at?: string
    cacheKey?: string
  }
  /** True when we fell back to source text on client-side error. */
  degraded?: boolean
}

// ─── Feature flag ───────────────────────────────────────────────────────────

export function isAdaptiveEnabled(): boolean {
  if (typeof process === 'undefined') return false
  return process.env.NEXT_PUBLIC_ADAPTIVE_ENABLED === 'true'
}

// ─── Transport ──────────────────────────────────────────────────────────────

/**
 * Adapt content via the active Endeavor. If no session is active, falls
 * back to a degraded response (no transformation).
 */
export async function adaptContent(
  req: AdaptRequest,
  fallbackText: string,
): Promise<AdaptResponse> {
  const session = await getActiveSession()
  if (!session) {
    return degraded(fallbackText, 'no-active-endeavor')
  }

  const url = `https://${session.domain}/api/content-ops/adapt`
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(await authHeaders(session.slug)),
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      credentials: 'include',
    })
    if (!res.ok) return degraded(fallbackText, `HTTP ${res.status}`)
    const body = (await res.json()) as Partial<AdaptResponse>
    if (!body.text) return degraded(fallbackText, 'empty-response')
    return {
      text: body.text,
      cached: !!body.cached,
      invariantsPassed: body.invariantsPassed ?? true,
      provenance: body.provenance,
    }
  } catch (err) {
    return degraded(fallbackText, err instanceof Error ? err.message : 'fetch-error')
  }
}

function degraded(text: string, _reason: string): AdaptResponse {
  return {
    text,
    cached: false,
    invariantsPassed: true,
    degraded: true,
  }
}
