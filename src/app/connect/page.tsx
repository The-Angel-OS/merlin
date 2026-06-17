'use client'
/**
 * /connect — Federation directory + Endeavor picker.
 *
 * Fresh-install landing. Three sections:
 *   1. Active / remembered Endeavors (if any)
 *   2. Federation directory (searchable grid)
 *   3. "I know the address" manual URL entry
 *
 * Endeavor-first: users pick sites, not servers. The hosting Enterprise is
 * shown as a small subtitle — plumbing, not a choice.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useConnection } from '@/hooks/useConnection'
import type { EndeavorRef } from '@/lib/federation'
import {
  Search, Radio, CheckCircle2, AlertCircle, Globe,
  ChevronRight, Wifi, WifiOff, RefreshCw,
} from 'lucide-react'

const CATEGORY_COLOR: Record<string, string> = {
  ministry: '#cc99cc',
  'community-help': '#99ccff',
  'small-business': '#f5a623',
  campaign: '#ff9a4d',
  default: '#7788aa',
}

function categoryColor(cat?: string): string {
  return (cat && CATEGORY_COLOR[cat]) || CATEGORY_COLOR.default
}

export default function ConnectPage() {
  const { directory, directoryLoading, directoryError, sessions, active, refreshDirectory, search } = useConnection()
  const [query, setQuery] = useState('')
  const [manualDomain, setManualDomain] = useState('')

  const rememberedSlugs = useMemo(
    () => new Set(sessions.map(s => s.slug)),
    [sessions],
  )

  const results = useMemo(() => search(query), [search, query])

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Radio className="h-7 w-7" style={{ color: '#99ccff' }} />
          <div>
            <h1 className="text-3xl font-semibold" style={{ color: '#eef2ff' }}>
              Federation
            </h1>
            <p className="text-sm" style={{ color: '#7788aa' }}>
              Search for your Endeavor, or pick from the directory
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs" style={{ color: '#7788aa' }}>
          {directory?.degraded ? (
            <span className="inline-flex items-center gap-1.5">
              <WifiOff className="h-3.5 w-3.5" style={{ color: '#f5a623' }} />
              Using cached / seed directory
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" style={{ color: '#22cc88' }} />
              Live from <code className="ml-1" style={{ color: '#99ccff' }}>spacesangels.com</code>
            </span>
          )}
          <button
            onClick={refreshDirectory}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-white/5"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </header>

      {/* ─── Active session ──────────────────────────────────────────── */}
      {active ? (
        <section className="mb-8 rounded-lg border p-4" style={{ borderColor: '#22cc8844', background: '#22cc8808' }}>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#22cc88' }}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Connected
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-medium" style={{ color: '#eef2ff' }}>{active.name}</div>
              <div className="text-xs" style={{ color: '#7788aa' }}>{active.domain} · signed in as {active.user.email}</div>
            </div>
            <Link
              href="/"
              className="rounded border px-3 py-1.5 text-sm hover:bg-white/5"
              style={{ borderColor: '#22cc8844', color: '#22cc88' }}
            >
              Enter →
            </Link>
          </div>
        </section>
      ) : null}

      {/* ─── Remembered sessions ─────────────────────────────────────── */}
      {sessions.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#7788aa' }}>
            Recent Endeavors ({sessions.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {sessions.map(s => (
              <Link
                key={s.slug}
                href={`/connect/${s.slug}`}
                className="group flex items-center justify-between rounded border px-3 py-2 hover:bg-white/5"
                style={{ borderColor: '#ffffff15' }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" style={{ color: '#eef2ff' }}>{s.name}</div>
                  <div className="truncate text-xs" style={{ color: '#7788aa' }}>{s.domain}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100" style={{ color: '#99ccff' }} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ─── Search ──────────────────────────────────────────────────── */}
      <section className="mb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: '#7788aa' }} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Endeavors — e.g. helpdna, hayes, ministry"
            className="w-full rounded border bg-black/20 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-white/30"
            style={{ borderColor: '#ffffff20', color: '#eef2ff' }}
          />
        </div>
      </section>

      {/* ─── Directory grid ─────────────────────────────────────────── */}
      <section className="mb-8">
        {directoryLoading ? (
          <div className="py-12 text-center text-sm" style={{ color: '#7788aa' }}>
            Loading federation directory…
          </div>
        ) : directoryError ? (
          <div className="rounded border p-4 text-sm" style={{ borderColor: '#cc444444', color: '#cc4444' }}>
            <AlertCircle className="mr-2 inline h-4 w-4" />
            {directoryError}
          </div>
        ) : results.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: '#7788aa' }}>
            {query ? `No Endeavors match "${query}"` : 'Directory is empty'}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map(e => (
              <EndeavorCard key={e.slug} e={e} remembered={rememberedSlugs.has(e.slug)} />
            ))}
          </div>
        )}
      </section>

      {/* ─── Manual address ─────────────────────────────────────────── */}
      <section className="rounded-lg border p-4" style={{ borderColor: '#ffffff15' }}>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#7788aa' }}>
          <Globe className="h-3.5 w-3.5" />
          I know the address
        </h2>
        <p className="mb-3 text-xs" style={{ color: '#7788aa' }}>
          For private Endeavors or self-hosted Enterprises not listed in the directory.
        </p>
        <form
          onSubmit={e => {
            e.preventDefault()
            const slug = manualDomain.trim().split('.')[0]
            if (slug) window.location.href = `/connect/${slug}?domain=${encodeURIComponent(manualDomain.trim())}`
          }}
          className="flex gap-2"
        >
          <input
            value={manualDomain}
            onChange={e => setManualDomain(e.target.value)}
            placeholder="helpdna.spacesangels.com"
            className="flex-1 rounded border bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/30"
            style={{ borderColor: '#ffffff20', color: '#eef2ff' }}
          />
          <button
            type="submit"
            className="rounded border px-4 py-2 text-sm hover:bg-white/5"
            style={{ borderColor: '#99ccff44', color: '#99ccff' }}
          >
            Probe
          </button>
        </form>
      </section>
    </div>
  )
}

function EndeavorCard({ e, remembered }: { e: EndeavorRef; remembered: boolean }) {
  const accent = categoryColor(e.publicProfile?.category)
  return (
    <Link
      href={`/connect/${e.slug}`}
      className="group block rounded-lg border p-4 transition hover:border-white/30"
      style={{ borderColor: '#ffffff15' }}
    >
      <div className="mb-2 flex items-start justify-between">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Radio className="h-5 w-5" />
        </div>
        {remembered ? (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: '#22cc8822', color: '#22cc88' }}
          >
            Signed in
          </span>
        ) : null}
      </div>
      <div className="mb-1 font-medium" style={{ color: '#eef2ff' }}>
        {e.name}
      </div>
      <div className="mb-2 font-mono text-xs" style={{ color: '#7788aa' }}>
        {e.domain}
      </div>
      {e.publicProfile?.about ? (
        <p className="line-clamp-2 text-xs" style={{ color: '#aabbcc' }}>
          {e.publicProfile.about}
        </p>
      ) : (
        <p className="text-xs italic" style={{ color: '#556677' }}>
          Hosted on {e.hostedOn}
        </p>
      )}
    </Link>
  )
}
