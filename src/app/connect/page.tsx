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
import { useMemo, useState, type ReactNode } from 'react'
import { useConnection } from '@/hooks/useConnection'
import type { EndeavorRef, EnterpriseRef } from '@/lib/federation'
import {
  Search, Radio, CheckCircle2, AlertCircle, Globe,
  ChevronRight, Wifi, WifiOff, RefreshCw, Building2, X,
} from 'lucide-react'

const CATEGORY_COLOR: Record<string, string> = {
  ministry: '#cc99cc',
  church: '#cc99cc',
  'community-help': '#99ccff',
  'small-business': '#f5a623',
  'retail-commerce': '#f5a623',
  campaign: '#ff9a4d',
  default: '#7788aa',
}

const STATUS_COLOR: Record<string, string> = {
  active: '#22cc88',
  probation: '#f5a623',
  applicant: '#99ccff',
  suspended: '#cc4444',
  revoked: '#cc4444',
}

function categoryColor(cat?: string): string {
  return (cat && CATEGORY_COLOR[cat]) || CATEGORY_COLOR.default
}

export default function ConnectPage() {
  const { directory, directoryLoading, directoryError, sessions, active, refreshDirectory, search } = useConnection()
  const [query, setQuery] = useState('')
  const [manualDomain, setManualDomain] = useState('')
  const [view, setView] = useState<'endeavors' | 'enterprises'>('endeavors')
  const [enterpriseFilter, setEnterpriseFilter] = useState<string | null>(null)

  const rememberedSlugs = useMemo(
    () => new Set(sessions.map(s => s.slug)),
    [sessions],
  )

  const enterprises = directory?.enterprises ?? []
  const endeavorCount = directory?.endeavors.length ?? 0
  const selectedEnterprise = enterprises.find(x => (x.id ?? x.domain) === enterpriseFilter)

  const results = useMemo(() => {
    const base = search(query)
    if (!enterpriseFilter) return base
    return base.filter(e => (e.enterpriseId ?? 'root') === enterpriseFilter)
  }, [search, query, enterpriseFilter])

  const pickEnterprise = (ent: EnterpriseRef) => {
    setEnterpriseFilter(ent.id ?? ent.domain)
    setView('endeavors')
  }

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
              Offline — cached / seed directory
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" style={{ color: '#22cc88' }} />
              <span style={{ color: '#22cc88' }}>Connected to federation</span>
              <span style={{ color: '#556677' }}>·</span>
              {endeavorCount} endeavor{endeavorCount === 1 ? '' : 's'} across {enterprises.length} enterprise{enterprises.length === 1 ? '' : 's'}
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

      {/* ─── View toggle: Endeavors | Enterprises ────────────────────── */}
      <section className="mb-4 flex items-center gap-2">
        <div className="inline-flex rounded border p-0.5" style={{ borderColor: '#ffffff20' }}>
          <ToggleBtn active={view === 'endeavors'} onClick={() => setView('endeavors')} icon={<Radio className="h-3.5 w-3.5" />} label="Endeavors" count={endeavorCount} />
          <ToggleBtn active={view === 'enterprises'} onClick={() => setView('enterprises')} icon={<Building2 className="h-3.5 w-3.5" />} label="Enterprises" count={enterprises.length} />
        </div>
        {selectedEnterprise ? (
          <button
            onClick={() => setEnterpriseFilter(null)}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-white/5"
            style={{ borderColor: '#99ccff44', color: '#99ccff' }}
          >
            <Building2 className="h-3 w-3" />
            {selectedEnterprise.name ?? selectedEnterprise.domain}
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </section>

      {/* ─── Search (endeavors view only) ────────────────────────────── */}
      {view === 'endeavors' ? (
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
      ) : null}

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
        ) : view === 'enterprises' ? (
          enterprises.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: '#7788aa' }}>No enterprises in the directory</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {enterprises.map(ent => (
                <EnterpriseCard key={ent.id ?? ent.domain} ent={ent} onPick={() => pickEnterprise(ent)} />
              ))}
            </div>
          )
        ) : results.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: '#7788aa' }}>
            {query ? `No Endeavors match "${query}"` : selectedEnterprise ? `No endeavors under ${selectedEnterprise.name ?? selectedEnterprise.domain}` : 'Directory is empty'}
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

function ToggleBtn({
  active, onClick, icon, label, count,
}: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition"
      style={
        active
          ? { background: '#99ccff22', color: '#99ccff' }
          : { color: '#7788aa' }
      }
    >
      {icon}
      {label}
      <span className="rounded-full px-1.5 text-[10px]" style={{ background: '#ffffff15', color: active ? '#99ccff' : '#7788aa' }}>
        {count}
      </span>
    </button>
  )
}

function EnterpriseCard({ ent, onPick }: { ent: EnterpriseRef; onPick: () => void }) {
  const accent = (ent.ministryStatus && STATUS_COLOR[ent.ministryStatus]) || '#7788aa'
  return (
    <button
      onClick={onPick}
      className="group block rounded-lg border p-4 text-left transition hover:border-white/30"
      style={{ borderColor: '#ffffff15' }}
    >
      <div className="mb-2 flex items-start justify-between">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded"
          style={{ background: `${accent}22`, color: accent }}
        >
          <Building2 className="h-5 w-5" />
        </div>
        {ent.ministryStatus ? (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: `${accent}22`, color: accent }}
          >
            {ent.ministryStatus}
          </span>
        ) : null}
      </div>
      <div className="mb-1 font-medium" style={{ color: '#eef2ff' }}>
        {ent.name ?? ent.domain}
      </div>
      <div className="mb-2 font-mono text-xs" style={{ color: '#7788aa' }}>
        {ent.domain}
      </div>
      <p className="inline-flex items-center gap-1 text-xs" style={{ color: '#99ccff' }}>
        {ent.hostsEndeavors ?? 0} endeavor{ent.hostsEndeavors === 1 ? '' : 's'}
        <ChevronRight className="h-3 w-3 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </p>
    </button>
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
