'use client'
/**
 * ConnectionPill — the "combadge" for Nimue's federation connection.
 *
 * Sits in the header. Shows the active Endeavor, expands on click to let
 * the user switch between remembered Endeavors or head to /connect to add
 * a new one.
 *
 * States:
 *   - no sessions → "Connect" button linking to /connect
 *   - one+ sessions, one active → pill with Endeavor name + dropdown
 */

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useConnection } from '@/hooks/useConnection'
import { Radio, ChevronDown, LogOut, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ConnectionPill() {
  const { active, sessions, switchTo, logout } = useConnection()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!active && sessions.length === 0) {
    return (
      <Link
        href="/connect"
        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-lcars-blue/40 bg-lcars-blue/8 text-lcars-blue text-[10px] font-mono hover:bg-lcars-blue/15 transition-colors"
        title="Connect to a Federation Endeavor"
      >
        <Radio className="size-3" />
        <span>Connect</span>
      </Link>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono transition-colors',
          active
            ? 'border-lcars-green/40 bg-lcars-green/8 text-lcars-green hover:bg-lcars-green/15'
            : 'border-border/60 text-muted-foreground hover:bg-accent/40',
        )}
        title={active ? `Connected to ${active.name}` : 'Switch Endeavor'}
      >
        <Radio className="size-3" />
        <span className="max-w-[120px] truncate">{active?.slug ?? 'offline'}</span>
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border shadow-xl"
          role="menu"
          style={{
            // Solid bg instead of bg-background/95 — the /95 compiles to
            // color-mix() which fails silently on older webviews (LG webOS,
            // BrowseHere) leaving the dropdown transparent and unreadable.
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="border-b border-border/40 px-3 py-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Endeavors
            </div>
          </div>

          <ul className="max-h-64 overflow-auto py-1">
            {sessions.map(s => {
              const isActive = active?.slug === s.slug
              return (
                <li key={s.slug}>
                  <button
                    onClick={async () => {
                      if (!isActive) await switchTo(s.slug)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/40"
                    role="menuitem"
                  >
                    <Radio
                      className="size-3.5 shrink-0"
                      style={{ color: isActive ? '#22cc88' : '#7788aa' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">{s.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{s.domain}</div>
                    </div>
                    {isActive ? <Check className="size-3.5 shrink-0 text-lcars-green" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-t border-border/40 p-1">
            <Link
              href="/connect"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-lcars-blue hover:bg-accent/40"
              role="menuitem"
            >
              <Plus className="size-3.5" />
              Connect to another Endeavor
            </Link>
            {active ? (
              <button
                onClick={async () => {
                  await logout(active.slug)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent/40"
                role="menuitem"
              >
                <LogOut className="size-3.5" />
                Sign out of {active.slug}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
