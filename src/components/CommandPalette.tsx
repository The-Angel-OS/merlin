'use client'
/**
 * CommandPalette — Ctrl+K / ⌘K overlay.
 * Fuzzy-searches all nav items + quick actions.
 * Arrow keys + Enter to navigate; Escape to close.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, LayoutDashboard, Activity, Image, Sparkles, Camera, Film,
  Key, Youtube, Radio, ExternalLink, ArrowRight, Upload, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Item = {
  id: string
  label: string
  sub?: string
  icon: React.ElementType
  color?: string
  href?: string
  external?: boolean
  action?: () => void
}

const NAV_ITEMS: Item[] = [
  { id: 'connect',      label: 'Federation',      sub: 'Connect',      icon: Radio,           color: '#99ccff',  href: '/connect' },
  { id: 'dashboard',    label: 'Dashboard',       sub: 'Bridge',       icon: LayoutDashboard, color: '#f5a623',  href: '/' },
  { id: 'log',          label: 'Activity Log',    sub: 'Bridge',       icon: Activity,        color: '#f5a623',  href: '/log' },
  { id: 'media',        label: 'Media',           sub: 'Media',        icon: Image,           color: '#99ccff',  href: '/media' },
  { id: 'inventory',    label: 'Ingest',          sub: 'Ingest',       icon: Upload,          color: '#ff9a4d',  href: '/inventory' },
  { id: 'inventory-new',label: 'New Batch',       sub: 'Ingest',       icon: Plus,            color: '#ff9a4d',  href: '/inventory/new' },
  { id: 'leo',          label: 'LEO — AI',        sub: 'Comms',        icon: Sparkles,        color: '#cc99cc',  href: '/leo' },
  { id: 'cameras',      label: 'Cameras',         sub: 'Surveillance', icon: Camera,          color: '#cc4444',  href: '/cameras' },
  { id: 'recording',    label: 'Recording',       sub: 'Surveillance', icon: Film,            color: '#cc4444',  href: '/recording' },
  { id: 'youtube',      label: 'YouTube',         sub: 'System',       icon: Youtube,         color: '#7788aa',  href: '/youtube' },
  { id: 'keys',         label: 'Keys & Config',   sub: 'System',       icon: Key,             color: '#7788aa',  href: '/keys' },
  { id: 'learn',        label: 'Learn',    sub: 'System',       icon: Sparkles,        color: '#99ccff',  href: '/learn' },
]

const EXTERNAL_ITEMS: Item[] = [
  { id: 'ext-angels',   label: 'SpacesAngels.com', sub: 'External',       icon: Radio,           color: '#f5a623',  href: 'https://www.spacesangels.com',               external: true },
  { id: 'ext-admin',    label: 'Angel OS Admin',   sub: 'External',       icon: ExternalLink,    color: '#99ccff',  href: 'https://www.spacesangels.com/admin',         external: true },
  { id: 'ext-youtube',  label: 'YouTube Studio',   sub: 'External',       icon: Youtube,         color: '#ff0000',  href: 'https://studio.youtube.com',                 external: true },
  { id: 'ext-answer53', label: 'Answer 53',        sub: 'External',       icon: ExternalLink,    color: '#9977aa',  href: 'https://answer53.vercel.app',               external: true },
]

const ALL_ITEMS = [...NAV_ITEMS, ...EXTERNAL_ITEMS]

function fuzzy(query: string, items: Item[]): Item[] {
  if (!query.trim()) return items
  const q = query.toLowerCase()
  return items.filter(item =>
    item.label.toLowerCase().includes(q) ||
    item.sub?.toLowerCase().includes(q) ||
    item.id.toLowerCase().includes(q)
  )
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = fuzzy(query, ALL_ITEMS)

  const navigate = useCallback((item: Item) => {
    onClose()
    setQuery('')
    if (item.action) { item.action(); return }
    if (item.href) {
      if (item.external) window.open(item.href, '_blank', 'noopener,noreferrer')
      else router.push(item.href)
    }
  }, [onClose, router])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => { setActiveIdx(0) }, [query])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-active="true"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIdx]) navigate(results[activeIdx])
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg rounded-xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in">
        {/* LCARS top stripe */}
        <div className="h-px bg-gradient-to-r from-lcars-amber via-lcars-blue to-lcars-purple" />

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Navigate, search, or jump to…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[10px] font-mono text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted/40 border border-border/60"
            >
              clear
            </button>
          )}
          <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/40 border border-border/60 text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </div>
          ) : (
            <div className="py-1">
              {/* Group by section when not searching */}
              {!query.trim() && (
                <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                  Navigation
                </div>
              )}
              {results.map((item, i) => {
                const Icon = item.icon
                const active = i === activeIdx
                return (
                  <button
                    key={item.id}
                    data-active={active}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      active ? 'bg-lcars-amber/10' : 'hover:bg-accent/40',
                    )}
                  >
                    {/* Icon with section color */}
                    <div
                      className="size-7 rounded-md flex items-center justify-center shrink-0"
                      style={{
                        background: `${item.color || '#7788aa'}18`,
                        color: item.color || '#7788aa',
                      }}
                    >
                      <Icon className="size-3.5" />
                    </div>

                    {/* Label + sub */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{item.label}</div>
                      {item.sub && (
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                          {item.sub}
                        </div>
                      )}
                    </div>

                    {/* Right indicator */}
                    <div className="shrink-0 text-muted-foreground">
                      {item.external
                        ? <ExternalLink className="size-3" />
                        : <ArrowRight className={cn('size-3 transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
                      }
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="border-t border-border/60 px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
          <span><kbd className="px-1 rounded bg-muted/40 border border-border/60">↑↓</kbd> navigate</span>
          <span><kbd className="px-1 rounded bg-muted/40 border border-border/60">↵</kbd> open</span>
          <span><kbd className="px-1 rounded bg-muted/40 border border-border/60">esc</kbd> close</span>
          <span className="ml-auto text-[9px]">{results.length} results</span>
        </div>

        {/* LCARS bottom stripe */}
        <div className="h-px bg-gradient-to-r from-lcars-purple via-lcars-blue to-lcars-amber" />
      </div>
    </div>
  )
}
