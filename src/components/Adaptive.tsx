'use client'
/**
 * <Adaptive> — render audience-tuned prose from an Angel OS source field.
 *
 * Props specify:
 *   source:     collection + id + field identifying the canonical prose
 *   audience:   readingLevel / tone / locale
 *   fallback:   the original prose, always rendered if server is unreachable
 *   invariants: strings that must appear verbatim in the adapted output
 *
 * UX rules:
 *   - Render `fallback` immediately — never block the page
 *   - Swap to adapted text when it arrives
 *   - Show a small provenance badge (adapted vs. original) so readers know
 *     what they're seeing. Transparency principle: gears visible.
 *   - Never hide an error — degraded state shows a subtle indicator
 *
 * Feature-flagged on NEXT_PUBLIC_ADAPTIVE_ENABLED so this ships dark until
 * the server-side Sprint 46 endpoints land.
 */

import { useEffect, useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import {
  adaptContent,
  isAdaptiveEnabled,
  type AdaptAudience,
  type AdaptSource,
} from '@/lib/adaptive'

export interface AdaptiveProps {
  source: AdaptSource
  audience: AdaptAudience
  /** The original prose — always rendered; swapped for adapted when ready. */
  fallback: string
  /** Strings that must appear verbatim (prices, SKUs, proper nouns). */
  invariants?: string[]
  /** Render the provenance badge. Default true. */
  showProvenance?: boolean
  /** Optional className on the wrapping <div>. */
  className?: string
}

type Status = 'initial' | 'loading' | 'adapted' | 'degraded' | 'disabled'

export function Adaptive({
  source,
  audience,
  fallback,
  invariants,
  showProvenance = true,
  className,
}: AdaptiveProps) {
  const [text, setText] = useState(fallback)
  const [status, setStatus] = useState<Status>(
    isAdaptiveEnabled() ? 'initial' : 'disabled',
  )

  useEffect(() => {
    if (!isAdaptiveEnabled()) return
    let cancelled = false
    setStatus('loading')
    adaptContent({ source, audience, invariants }, fallback).then(res => {
      if (cancelled) return
      setText(res.text)
      setStatus(res.degraded ? 'degraded' : 'adapted')
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.collection, source.id, source.field, audience.readingLevel, audience.tone, audience.locale])

  return (
    <div className={className}>
      <div>{text}</div>
      {showProvenance && status !== 'disabled' ? (
        <ProvenanceBadge status={status} audience={audience} />
      ) : null}
    </div>
  )
}

function ProvenanceBadge({ status, audience }: { status: Status; audience: AdaptAudience }) {
  if (status === 'initial' || status === 'loading') {
    return (
      <div className="mt-2 text-[10px] uppercase tracking-wider" style={{ color: '#7788aa' }}>
        Adapting…
      </div>
    )
  }
  if (status === 'adapted') {
    const label = [audience.readingLevel, audience.tone, audience.locale]
      .filter(Boolean)
      .join(' · ')
    return (
      <div className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: '#cc99cc' }}>
        <Sparkles className="h-3 w-3" />
        Adapted {label ? `· ${label}` : ''}
      </div>
    )
  }
  if (status === 'degraded') {
    return (
      <div className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: '#f5a623' }}>
        <AlertCircle className="h-3 w-3" />
        Original (adapter offline)
      </div>
    )
  }
  return null
}
