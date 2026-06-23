'use client'
/**
 * SidebarLayout — client wrapper that owns:
 *   • sidebar collapsed/expanded state (persisted to localStorage)
 *   • global connection status (polled every 30s)
 *   • notification count (polled every 15s)
 *   • command palette open/close (via custom DOM event)
 */
import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import AppHeader from './AppHeader'
import CommandPalette from './CommandPalette'

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [responseMs, setResponseMs] = useState<number | null>(null)
  const [notifications, setNotifications] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // Mobile: the fixed 14rem sidebar + inline main margin made the page unusable on
  // narrow screens (content shoved off-canvas, clipped by body overflow-x-hidden).
  // Below md, the sidebar becomes an off-canvas drawer and main drops its left margin.
  const [mobile, setMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem('merlin-sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  // Track viewport — keep in sync with Tailwind's md breakpoint (768px)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Close the mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem('merlin-sidebar-collapsed', String(next))
      return next
    })
  }, [])

  // Connection status polling
  useEffect(() => {
    const check = () =>
      fetch('/api/angels/status')
        .then(r => r.json())
        .then(d => { setIsOnline(!!d.online); setResponseMs(d.responseMs ?? null) })
        .catch(() => setIsOnline(false))
    check()
    const iv = setInterval(check, 30_000)
    return () => clearInterval(iv)
  }, [])

  // Notification count polling
  useEffect(() => {
    const load = () =>
      fetch('/api/system')
        .then(r => r.json())
        .then(d => setNotifications((d.incidents?.open || 0) + (d.inbox?.new || 0)))
        .catch(() => {})
    load()
    const iv = setInterval(load, 15_000)
    return () => clearInterval(iv)
  }, [])

  // Command palette event bridge
  useEffect(() => {
    const open = () => setPaletteOpen(true)
    window.addEventListener('merlin:palette', open)
    return () => window.removeEventListener('merlin:palette', open)
  }, [])

  // Boot the inventory uploader once per session — it lazy-loads to keep
  // IndexedDB/crypto code out of the initial bundle.
  useEffect(() => {
    let cancelled = false
    import('@/lib/inventoryUploader')
      .then(mod => {
        if (cancelled) return
        // Wrap in Promise.resolve so sync throws also hit the catch —
        // on non-secure contexts (http://LAN-IP) crypto.subtle is undefined
        // and we don't want an unhandled rejection to crash the app shell.
        Promise.resolve()
          .then(() => mod.startUploader())
          .catch(err => { console.warn('[merlin] uploader boot failed:', err) })
      })
      .catch(err => { console.warn('[merlin] uploader import failed:', err) })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobile={mobile}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile drawer backdrop */}
      {mobile && mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <main
        className="min-h-screen flex flex-col transition-[margin] duration-200"
        style={{ marginLeft: mobile ? 0 : collapsed ? '3.5rem' : '14rem' }}
      >
        <AppHeader
          isOnline={isOnline}
          responseMs={responseMs}
          notifications={notifications}
          onPaletteOpen={() => setPaletteOpen(true)}
          onMenuOpen={() => setMobileOpen(true)}
        />
        <div className="flex-1 p-5 max-w-screen-2xl">
          {children}
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
