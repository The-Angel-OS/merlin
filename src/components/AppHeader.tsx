'use client'
/**
 * AppHeader — sticky top bar inside the main content area.
 * Shows: breadcrumb trail, Ctrl+K search trigger, notifications, LEO shortcut, connection pill.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Search, Bell, Sparkles, Wifi, WifiOff, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import ConnectionPill from '@/components/ConnectionPill'

type Crumb = { label: string; color: string; parent?: string; parentColor?: string }

const CRUMBS: Record<string, Crumb> = {
  '/':                      { label: 'Dashboard',      color: '#f5a623' },
  '/connect':               { label: 'Federation',     color: '#99ccff', parent: 'Connect',      parentColor: '#99ccff' },
  '/log':                   { label: 'Activity Log',   color: '#f5a623', parent: 'Bridge',       parentColor: '#f5a623' },
  '/media':                 { label: 'Media',          color: '#99ccff', parent: 'Media',        parentColor: '#99ccff' },
  '/inventory':             { label: 'Ingest',         color: '#ff9a4d', parent: 'Ingest',       parentColor: '#ff9a4d' },
  '/inventory/new':         { label: 'New Batch',      color: '#ff9a4d', parent: 'Ingest',       parentColor: '#ff9a4d' },
  '/leo':                   { label: 'LEO — AI',       color: '#cc99cc', parent: 'Comms',        parentColor: '#cc99cc' },
  '/cameras':               { label: 'Cameras',        color: '#cc4444', parent: 'Surveillance', parentColor: '#cc4444' },
  '/recording':             { label: 'Recording',      color: '#cc4444', parent: 'Surveillance', parentColor: '#cc4444' },
  '/youtube':               { label: 'YouTube',        color: '#7788aa', parent: 'System',       parentColor: '#7788aa' },
  '/keys':                  { label: 'Keys & Config',  color: '#7788aa', parent: 'System',       parentColor: '#7788aa' },
  '/learn':                 { label: 'System Guide',   color: '#99ccff', parent: 'System',       parentColor: '#7788aa' },
}

function resolveCrumb(pathname: string): Crumb | undefined {
  return Object.entries(CRUMBS)
    .filter(([path]) => pathname === path || pathname.startsWith(path + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1]
}

export default function AppHeader({
  isOnline,
  responseMs,
  notifications,
  onPaletteOpen,
}: {
  isOnline: boolean | null
  responseMs: number | null
  notifications: number
  onPaletteOpen: () => void
}) {
  const pathname = usePathname()
  const crumb = resolveCrumb(pathname)

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onPaletteOpen()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPaletteOpen])

  return (
    <header className="sticky top-0 z-20 h-12 flex items-center border-b border-border/60 bg-background/90 backdrop-blur-xl shrink-0">
      {/* LCARS left accent bar — color-coded per section */}
      <div
        className="absolute left-0 top-0 bottom-0 w-px opacity-60"
        style={{ background: `linear-gradient(to bottom, transparent, ${crumb?.color || '#f5a623'}, transparent)` }}
      />

      <div className="flex items-center gap-3 px-4 w-full">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 select-none">
          {crumb?.parent && (
            <>
              <span
                className="text-[10px] font-mono uppercase tracking-widest hidden sm:inline"
                style={{ color: crumb.parentColor ? `${crumb.parentColor}99` : '#7788aa' }}
              >
                {crumb.parent}
              </span>
              <ChevronRight className="size-3 text-muted-foreground/40 hidden sm:inline" />
            </>
          )}
          <span
            className="text-[11px] font-mono uppercase tracking-widest font-semibold"
            style={{ color: crumb?.color || '#f5a623' }}
          >
            {crumb?.label || 'MERLIN'}
          </span>
        </div>

        {/* Search / Command Palette trigger */}
        <button
          onClick={onPaletteOpen}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/60 bg-card/40 hover:border-lcars-amber/40 hover:bg-card/70 transition-all text-muted-foreground w-52 group"
        >
          <Search className="size-3.5 group-hover:text-lcars-amber transition-colors" />
          <span className="flex-1 text-left text-[11px]">Quick navigate…</span>
          <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/60 border border-border/60 leading-none">
            ⌘K
          </kbd>
        </button>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Endeavor combadge */}
          <ConnectionPill />
          {/* Connection status pill */}
          <div className={cn(
            'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono transition-colors',
            isOnline === null
              ? 'border-border/60 text-muted-foreground'
              : isOnline
                ? 'border-lcars-green/30 bg-lcars-green/8 text-lcars-green'
                : 'border-lcars-amber/30 bg-lcars-amber/8 text-lcars-amber',
          )}>
            {isOnline === null
              ? <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
              : isOnline
                ? <Wifi className="size-3" />
                : <WifiOff className="size-3" />
            }
            <span className="tabular-nums">
              {isOnline === null ? '···' : isOnline ? `${responseMs ?? '?'}ms` : 'cache'}
            </span>
          </div>

          {/* Notification bell */}
          <Link
            href="/inbox"
            className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            title="Inbox"
          >
            <Bell className="size-4" />
            {notifications > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 rounded-full bg-lcars-amber text-black text-[8px] font-bold font-mono flex items-center justify-center px-0.5 leading-none">
                {notifications > 99 ? '99+' : notifications}
              </span>
            )}
          </Link>

          {/* LEO shortcut */}
          <Link
            href="/leo"
            className={cn(
              'p-2 rounded-lg transition-colors',
              pathname === '/leo'
                ? 'text-lcars-amber bg-lcars-amber/10'
                : 'text-muted-foreground hover:text-lcars-amber hover:bg-lcars-amber/10',
            )}
            title="Open LEO — Angel AI"
          >
            <Sparkles className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
