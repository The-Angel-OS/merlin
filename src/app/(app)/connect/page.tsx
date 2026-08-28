'use client'
/**
 * /connect — the portal picker.
 *
 * There is ONE Enterprise. Searching a directory of them, filtering by them,
 * and toggling between "Endeavors" and "Enterprises" described a world that
 * does not exist yet — and made the simplest thing Merlin does (attach to your
 * portal) look like an infrastructure decision. So the directory grid, the
 * search box, the view toggle and the federation framing are gone.
 *
 * What is left is what a person actually needs: the portal you are in, the
 * portals you have been in, and a box for one you have not. Same shape as
 * Nimue's portal list, for the same reason — you pick a place, never a server.
 *
 * The federation data layer (lib/federation.ts, the directory endpoints) is
 * untouched. This is language and surface, not capability: when there IS a
 * second Enterprise, the grid comes back with something true to show.
 */

import Link from 'next/link'
import { useState } from 'react'
import { useConnection } from '@/hooks/useConnection'
import { NodeLockOn } from '@/components/NodeLockOn'
import { CheckCircle2, Globe, ChevronRight, Radio } from 'lucide-react'

export default function ConnectPage() {
  const { sessions, active } = useConnection()
  const [manualDomain, setManualDomain] = useState('')

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Radio className="h-7 w-7" style={{ color: '#99ccff' }} />
          <div>
            <h1 className="text-3xl font-semibold" style={{ color: '#eef2ff' }}>
              Portals
            </h1>
            <p className="text-sm" style={{ color: '#7788aa' }}>
              The portal this machine is attached to
            </p>
          </div>
        </div>
      </header>

      {/* The portal you are in */}
      {active ? (
        <section className="mb-8 rounded-lg border p-4" style={{ borderColor: '#22cc8844', background: '#22cc8808' }}>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#22cc88' }}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Connected
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-medium" style={{ color: '#eef2ff' }}>{active.name}</div>
              <div className="text-xs" style={{ color: '#7788aa' }}>{active.domain} &middot; signed in as {active.user.email}</div>
            </div>
            <Link
              href="/"
              className="rounded border px-3 py-1.5 text-sm hover:bg-white/5"
              style={{ borderColor: '#22cc8844', color: '#22cc88' }}
            >
              Enter &rarr;
            </Link>
          </div>
          {/* Lock THIS machine (Merlin node) onto the signed-in portal + start beaming. */}
          <div className="mt-3">
            <NodeLockOn slug={active.slug} name={active.name} domain={active.domain} />
          </div>
        </section>
      ) : (
        <section className="mb-8 rounded-lg border p-6 text-center" style={{ borderColor: '#ffffff15' }}>
          <div className="text-sm" style={{ color: '#7788aa' }}>
            This machine is not attached to a portal yet. Enter its address below.
          </div>
        </section>
      )}

      {/* Portals you have been in */}
      {sessions.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#7788aa' }}>
            Your portals ({sessions.length})
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

      {/* A portal you have not been in */}
      <section className="rounded-lg border p-4" style={{ borderColor: '#ffffff15' }}>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#7788aa' }}>
          <Globe className="h-3.5 w-3.5" />
          Connect to another portal
        </h2>
        <p className="mb-3 text-xs" style={{ color: '#7788aa' }}>
          Its address, the way you would type it into a browser.
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
            placeholder="clearwater-cruisin.spacesangels.com"
            className="flex-1 rounded border bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/30"
            style={{ borderColor: '#ffffff20', color: '#eef2ff' }}
          />
          <button
            type="submit"
            className="rounded border px-4 py-2 text-sm hover:bg-white/5"
            style={{ borderColor: '#99ccff44', color: '#99ccff' }}
          >
            Connect
          </button>
        </form>
      </section>
    </div>
  )
}
