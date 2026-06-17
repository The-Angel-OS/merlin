'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Wifi, WifiOff, Radio, Menu, X } from 'lucide-react'

interface Tenant { id: string; name: string; slug: string; domain?: string }

const NAV_ITEMS = [
  { href: '/', label: 'Bridge' },
  { href: '/cic', label: 'CIC' },
  { href: '/spaces', label: 'Spaces' },
  { href: '/media', label: 'Media' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/youtube', label: 'YouTube' },
  { href: '/leo', label: 'LEO' },
  { href: '/log', label: 'Log' },
  { href: '/keys', label: 'Keys' },
]

export default function Header() {
  const pathname = usePathname()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [showTenantPicker, setShowTenantPicker] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [responseMs, setResponseMs] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Load tenants (via cache-safe proxy)
  useEffect(() => {
    fetch('/api/payload/tenants?limit=50')
      .then(r => r.json())
      .then(res => {
        const docs = res?.data?.docs || []
        setTenants(docs)
        // Restore last selected tenant
        const saved = typeof window !== 'undefined' ? localStorage.getItem('nimue-tenant') : null
        if (saved) {
          const found = docs.find((t: Tenant) => t.slug === saved)
          if (found) setTenant(found)
          else if (docs[0]) setTenant(docs[0])
        } else if (docs[0]) {
          setTenant(docs[0])
        }
      })
      .catch(() => {})
  }, [])

  // Status polling
  useEffect(() => {
    const check = () => {
      fetch('/api/angels/status')
        .then(r => r.json())
        .then(d => {
          setOnline(!!d.online)
          setResponseMs(d.responseMs ?? null)
        })
        .catch(() => setOnline(false))
    }
    check()
    const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
  }, [])

  const pickTenant = (t: Tenant) => {
    setTenant(t)
    if (typeof window !== 'undefined') localStorage.setItem('nimue-tenant', t.slug)
    setShowTenantPicker(false)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      {/* Top LCARS accent bar */}
      <div className="h-0.5 bg-gradient-to-r from-lcars-amber via-lcars-blue to-lcars-purple opacity-60" />

      <nav className="container flex h-14 items-center gap-4">
        {/* Mobile menu toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>

        {/* Logo + Tenant picker */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="size-7 rounded-md bg-gradient-to-br from-lcars-amber to-lcars-orange flex items-center justify-center shadow-sm shadow-lcars-amber/40">
              <span className="text-black font-bold text-sm">M</span>
            </div>
            <span className="hidden sm:inline text-sm font-mono uppercase tracking-widest text-foreground">
              MERLIN
            </span>
          </Link>

          {/* Tenant picker */}
          <div className="relative">
            <button
              onClick={() => setShowTenantPicker(!showTenantPicker)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/60 bg-card/40 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-lcars-amber/40 transition"
            >
              <Radio className="size-3 text-lcars-amber" />
              <span className="max-w-[120px] truncate">{tenant?.name || 'Select Enterprise'}</span>
              <ChevronDown className="size-3" />
            </button>
            {showTenantPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTenantPicker(false)} />
                <div
                  className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-border shadow-xl overflow-hidden"
                  style={{ backgroundColor: 'var(--card)' }}
                >
                  <div className="px-3 py-2 border-b border-border/60 text-[10px] font-mono uppercase tracking-widest text-lcars-amber">
                    Enterprise Registry
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {tenants.length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                        No enterprises cached. Connect to mothership.
                      </div>
                    )}
                    {tenants.map(t => (
                      <button
                        key={t.id}
                        onClick={() => pickTenant(t)}
                        className={cn(
                          'w-full px-3 py-2 text-left text-xs hover:bg-accent/50 transition',
                          tenant?.id === t.id && 'bg-lcars-amber/10 text-lcars-amber',
                        )}
                      >
                        <div className="font-medium">{t.name}</div>
                        {t.domain && <div className="text-[10px] text-muted-foreground font-mono">{t.domain}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Desktop nav */}
        <ul className="hidden md:flex items-center gap-5 ml-4">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-active={active}
                  className={cn(
                    'relative text-[11px] font-mono uppercase tracking-widest py-2 transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-[15px] h-0.5 bg-lcars-amber" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Right: status + actions */}
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-card/40">
            {online === null ? (
              <>
                <div className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
                <span className="text-[10px] font-mono uppercase text-muted-foreground">init</span>
              </>
            ) : online ? (
              <>
                <div className="size-1.5 rounded-full bg-emerald-400 liveness-dot" />
                <Wifi className="size-3 text-emerald-400" />
                <span className="text-[10px] font-mono uppercase text-emerald-400">
                  {responseMs !== null ? `${responseMs}ms` : 'live'}
                </span>
              </>
            ) : (
              <>
                <div className="size-1.5 rounded-full bg-amber-400" />
                <WifiOff className="size-3 text-amber-400" />
                <span className="text-[10px] font-mono uppercase text-amber-400">cache</span>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur-xl animate-fade-in">
          <ul className="container flex flex-col py-2">
            {NAV_ITEMS.map(item => {
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'block px-3 py-3 text-sm font-mono uppercase tracking-widest border-l-2 transition',
                      active
                        ? 'border-lcars-amber text-foreground bg-lcars-amber/5'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </header>
  )
}
