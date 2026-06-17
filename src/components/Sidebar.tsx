'use client'
/**
 * Sidebar — left navigation panel.
 * Supports collapsed (icon-only, w-14) and expanded (w-56) modes.
 * Section headers act as collapse toggles.
 * Live badges on Inbox and Cameras via /api/system.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { appStorage } from '@/lib/storage'
import {
  LayoutDashboard, Radio, Image, Sparkles, Youtube, Key, Activity,
  Camera, Film, ChevronDown, ChevronRight, Wifi, WifiOff,
  PanelLeftClose, PanelLeft, Upload, ExternalLink,
} from 'lucide-react'

interface Tenant { id: string; name: string; slug: string; domain?: string }

type NavItem = { href: string; label: string; icon: React.ElementType; badgeKey?: string; external?: boolean }
type NavSection = { title: string; items: NavItem[]; accent: string }

// Home portal — Merlin is COMPLEMENTARY to Angel OS, not a replacement. Anything
// Angel OS already handles (CMS, full Spaces, commerce, the Library) lives there;
// this link makes switching back and forth one click.
const ANGELS_PORTAL = process.env.NEXT_PUBLIC_ANGELS_URL || 'https://spacesangels.com'

const NAV: NavSection[] = [
  {
    title: 'Connect', accent: '#99ccff',
    items: [
      { href: '/connect', label: 'Federation', icon: Radio },
      { href: ANGELS_PORTAL, label: 'Angel OS Portal', icon: ExternalLink, external: true },
    ],
  },
  {
    title: 'Bridge', accent: '#f5a623',
    items: [
      { href: '/',    label: 'Dashboard',    icon: LayoutDashboard },
      { href: '/log', label: 'Activity Log', icon: Activity },
    ],
  },
  {
    title: 'Media', accent: '#99ccff',
    items: [
      { href: '/media', label: 'Media', icon: Image },
    ],
  },
  {
    title: 'Ingest', accent: '#ff9a4d',
    items: [
      { href: '/inventory',     label: 'Ingest',    icon: Upload, badgeKey: 'inventoryQueue' },
      { href: '/inventory/new', label: 'New Batch', icon: Camera },
    ],
  },
  {
    title: 'Comms', accent: '#cc99cc',
    items: [
      { href: '/leo', label: 'LEO', icon: Sparkles },
    ],
  },
  {
    title: 'Surveillance', accent: '#cc4444',
    items: [
      { href: '/cameras',   label: 'Cameras',   icon: Camera, badgeKey: 'cameras' },
      { href: '/recording', label: 'Recording', icon: Film },
    ],
  },
  {
    title: 'System', accent: '#7788aa',
    items: [
      { href: '/youtube', label: 'YouTube',       icon: Youtube },
      { href: '/keys',    label: 'Keys & Config', icon: Key },
      { href: '/learn',   label: 'System Guide',  icon: Sparkles },
    ],
  },
]

// ─── Nav Link ───────────────────────────────────────────────────────────────
function NavLink({
  item, accent, collapsed, badge,
}: {
  item: NavItem; accent: string; collapsed: boolean; badge?: number
}) {
  const pathname = usePathname()
  const active = item.href === '/'
    ? pathname === '/'
    : pathname.startsWith(item.href)

  const inner = (
    <>
      {active && !collapsed && (
        <span
          className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-full"
          style={{ background: accent }}
        />
      )}
      <item.icon
        className={cn('shrink-0', collapsed ? 'size-5' : 'size-3.5', active && 'drop-shadow-sm')}
        style={active ? { color: accent } : {}}
      />
      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span
          className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded-full"
          style={{ background: `${accent}25`, color: accent }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {/* Collapsed badge dot */}
      {collapsed && badge !== undefined && badge > 0 && (
        <span
          className="absolute top-0.5 right-0.5 size-2 rounded-full border border-background"
          style={{ background: accent }}
        />
      )}
    </>
  )

  const cls = cn(
    'relative flex items-center rounded-md text-xs transition-colors',
    collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-1.5',
    active
      ? 'bg-white/8 text-foreground font-medium'
      : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
  )

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls} title={collapsed ? item.label : undefined}>
        {inner}
      </a>
    )
  }

  return (
    <Link href={item.href} className={cls} title={collapsed ? item.label : undefined}>
      {inner}
    </Link>
  )
}

// ─── Section ────────────────────────────────────────────────────────────────
function Section({
  section, collapsed: sidebarCollapsed, sectionCollapsed, onToggle, badges,
}: {
  section: NavSection
  collapsed: boolean
  sectionCollapsed: boolean
  onToggle: () => void
  badges: Record<string, number>
}) {
  if (sidebarCollapsed) {
    // Icon-only mode: render all items as stacked icons
    return (
      <div className="space-y-0.5 pt-1 border-t border-border/30 first:border-0 first:pt-0">
        {section.items.map(item => (
          <NavLink
            key={item.href}
            item={item}
            accent={section.accent}
            collapsed
            badge={item.badgeKey ? badges[item.badgeKey] : undefined}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1 text-[9px] font-mono uppercase tracking-widest hover:opacity-90 transition-opacity"
        style={{ color: section.accent }}
      >
        <span className="inline-block size-1.5 rounded-full shrink-0" style={{ background: section.accent }} />
        <span className="flex-1 text-left">{section.title}</span>
        {sectionCollapsed
          ? <ChevronRight className="size-3 opacity-50" />
          : <ChevronDown className="size-3 opacity-50" />}
      </button>
      {!sectionCollapsed && (
        <div className="space-y-0.5">
          {section.items.map(item => (
            <NavLink
              key={item.href}
              item={item}
              accent={section.accent}
              collapsed={false}
              badge={item.badgeKey ? badges[item.badgeKey] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ────────────────────────────────────────────────────────────────
export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({})
  const [badges, setBadges] = useState<Record<string, number>>({})

  // Tenant list
  useEffect(() => {
    fetch('/api/payload/tenants?limit=50')
      .then(r => r.json())
      .then(res => {
        const docs = res?.data?.docs || []
        setTenants(docs)
        const saved = appStorage.getTenant()
        const found = saved ? docs.find((t: Tenant) => t.slug === saved) : null
        setTenant(found || docs[0] || null)
      })
      .catch(() => {})
  }, [])

  // Connection status
  useEffect(() => {
    const check = () =>
      fetch('/api/angels/status')
        .then(r => r.json())
        .then(d => setOnline(!!d.online))
        .catch(() => setOnline(false))
    check()
    const iv = setInterval(check, 30_000)
    return () => clearInterval(iv)
  }, [])

  // Live badges
  useEffect(() => {
    const load = () =>
      fetch('/api/system')
        .then(r => r.json())
        .then(d => setBadges(prev => ({
          ...prev,
          inbox: (d.incidents?.open || 0) + (d.inbox?.new || 0),
          cameras: 0, // can extend: fetch camera count
        })))
        .catch(() => {})
    load()
    const iv = setInterval(load, 15_000)
    return () => clearInterval(iv)
  }, [])

  // Inventory queue badge (pending + error items)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const { getStats } = await import('@/lib/inventoryQueue')
        const s = await getStats()
        if (!cancelled) setBadges(prev => ({ ...prev, inventoryQueue: s.pending + s.error }))
      } catch { /* IndexedDB unavailable */ }
    }
    load()
    const onUp = () => load()
    window.addEventListener('nimue:uploader', onUp)
    const iv = setInterval(load, 5_000)
    return () => {
      cancelled = true
      clearInterval(iv)
      window.removeEventListener('nimue:uploader', onUp)
    }
  }, [])

  const pickTenant = (t: Tenant) => {
    setTenant(t)
    appStorage.setTenant(t.slug)
    setShowPicker(false)
  }

  const toggleSection = (title: string) =>
    setSectionCollapsed(prev => ({ ...prev, [title]: !prev[title] }))

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 flex flex-col border-r border-border/60 bg-background/97 backdrop-blur-xl z-30 overflow-hidden transition-[width] duration-200"
      style={{ width: collapsed ? '3.5rem' : '14rem' }}
    >
      {/* Top LCARS stripe */}
      <div className="h-0.5 bg-gradient-to-r from-lcars-amber via-lcars-blue to-lcars-purple opacity-60 shrink-0" />

      {/* Logo row */}
      <div className={cn(
        'flex items-center border-b border-border/60 shrink-0',
        collapsed ? 'justify-center py-3 px-2' : 'gap-2.5 px-4 py-3',
      )}>
        <div className="size-7 rounded-md bg-gradient-to-br from-lcars-amber to-lcars-orange flex items-center justify-center shadow-sm shadow-lcars-amber/30 shrink-0">
          <span className="text-black font-bold text-sm">M</span>
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono uppercase tracking-widest font-semibold">MERLIN</div>
            <div className="text-[9px] font-mono text-muted-foreground">Angel OS Media Server</div>
          </div>
        )}
        {!collapsed && (
          <span
            className="size-2 rounded-full"
            title={online ? 'Online' : 'Offline'}
            style={{
              background: online === null ? '#7788aa' : online ? '#22cc88' : '#f5a623',
              boxShadow: online ? '0 0 6px #22cc8860' : 'none',
              animation: online ? 'liveness-dot-pulse 1.2s ease-in-out infinite' : 'none',
            }}
          />
        )}
      </div>

      {/* Tenant picker — hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 py-2 border-b border-border/60 shrink-0 relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/60 bg-card/40 hover:border-lcars-amber/40 transition text-left"
          >
            <Radio className="size-3 text-lcars-amber shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate flex-1">
              {tenant?.name || 'Select Enterprise'}
            </span>
            <ChevronDown className="size-3 text-muted-foreground shrink-0" />
          </button>
          {showPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
              <div
                className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg border border-border shadow-xl overflow-hidden"
                style={{ backgroundColor: 'var(--card)' }}
              >
                <div className="px-3 py-1.5 border-b border-border/60 text-[9px] font-mono uppercase tracking-widest text-lcars-amber">
                  Enterprise Registry
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {tenants.length === 0 ? (
                    <div className="px-3 py-3 text-[10px] text-muted-foreground text-center">
                      No tenants. Configure Angels API in Keys.
                    </div>
                  ) : (
                    tenants.map(t => (
                      <button
                        key={t.id}
                        onClick={() => pickTenant(t)}
                        className={cn(
                          'w-full px-3 py-1.5 text-left text-xs hover:bg-accent/50 transition',
                          tenant?.id === t.id && 'bg-lcars-amber/10 text-lcars-amber',
                        )}
                      >
                        <div className="font-medium truncate">{t.name}</div>
                        {t.domain && <div className="text-[9px] text-muted-foreground font-mono">{t.domain}</div>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-none py-2 px-2 space-y-3">
        {NAV.map(section => (
          <Section
            key={section.title}
            section={section}
            collapsed={collapsed}
            sectionCollapsed={!!sectionCollapsed[section.title]}
            onToggle={() => toggleSection(section.title)}
            badges={badges}
          />
        ))}
      </nav>

      {/* Bottom: status + collapse toggle */}
      <div className="shrink-0 border-t border-border/60">
        {!collapsed && (
          <div className="px-3 py-2 flex items-center gap-2 text-[10px] font-mono">
            {online ? (
              <><Wifi className="size-3 text-lcars-green" /><span className="text-lcars-green uppercase tracking-wider">Mothership Live</span></>
            ) : (
              <><WifiOff className="size-3 text-lcars-amber" /><span className="text-lcars-amber uppercase tracking-wider">Local Cache</span></>
            )}
          </div>
        )}
        {/* Collapse / expand toggle */}
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors',
            collapsed ? 'justify-center py-2.5' : 'gap-2 px-3 py-2 text-[10px] font-mono uppercase tracking-wider border-t border-border/60',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <PanelLeft className="size-4" />
            : <><PanelLeftClose className="size-3.5" /><span>Collapse</span></>
          }
        </button>
      </div>

      {/* Bottom LCARS stripe */}
      <div className="h-0.5 bg-gradient-to-r from-lcars-purple via-lcars-blue to-lcars-amber opacity-60 shrink-0" />
    </aside>
  )
}
