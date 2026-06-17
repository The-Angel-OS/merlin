'use client'
/**
 * NIMUE Bridge Dashboard — Angel OS Control Panel
 * Framer Motion stagger + spring animations throughout.
 * Live data from /api/system + /api/payload/*
 */
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Radio, Inbox, AlertTriangle, Cpu, HardDrive, Wifi,
  ArrowRight, Sparkles, BookOpen, ShoppingBag, CalendarDays,
  Camera, ExternalLink, BarChart3, Users, RefreshCw, Plus,
  Package, FileText, Globe, Youtube, Server,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────────────── */
interface SystemData {
  system: { uptime: number; hostname: string; localIp: string; cpus: number; memory: { used: number; total: number } }
  angels: { online: boolean; responseMs: number | null; lastChecked: string | null }
  incidents: { open: number }
  inbox: { new: number }
  recentActivity: Array<{ id: string; timestamp: string; type: string; source: string; message: string }>
}
interface ContentItem { id: string | number; title: string; _status?: string; slug?: string; publishedAt?: string; createdAt?: string; price?: number; priceJSON?: string; tenant?: { name: string } }
interface Camera { id: string; name: string; snapshotUrl?: string; protocol: string }

/* ─── Animation variants ────────────────────────────────────────────── */
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 280, damping: 28 } },
}
const fadeIn = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } }

/* ─── Helpers ───────────────────────────────────────────────────────── */
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`; if (h) return `${h}h ${m}m`; return `${m}m`
}

const TYPE_DOT: Record<string, string> = {
  incident: '#cc4444', error: '#cc4444', angels: '#22cc88', file_arrived: '#99ccff',
  youtube_update: '#cc99cc', system: '#7788aa', info: '#99ccff', api_call: '#f5a623',
}

/* ─── Animated stat card ────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, accent = '#f5a623', href }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; accent?: string; href?: string
}) {
  const Inner = (
    <motion.div
      variants={item}
      whileHover={{ scale: 1.02, y: -2 }}
      className="relative flex items-center gap-4 rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-4 cursor-pointer group overflow-hidden"
      style={{ boxShadow: `0 0 0 0 ${accent}00` }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Subtle hover glow */}
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}12, transparent 70%)` }}
      />
      {/* Section accent bar */}
      <div className="absolute left-0 top-3 bottom-3 w-px rounded-r-full" style={{ background: accent }} />
      {/* Icon */}
      <div className="size-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}12`, color: accent }}>
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0 relative z-10">
        <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: `${accent}99` }}>{label}</div>
        <div className="text-2xl font-mono tabular-nums font-semibold leading-tight">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </motion.div>
  )
  return href ? <Link href={href}>{Inner}</Link> : Inner
}

/* ─── Content tabs ──────────────────────────────────────────────────── */
const TABS = [
  { key: 'posts',    label: 'Posts',    icon: BookOpen,   color: '#99ccff', endpoint: '/api/payload/posts?limit=8&depth=1&sort=-createdAt' },
  { key: 'products', label: 'Products', icon: ShoppingBag, color: '#22cc88', endpoint: '/api/payload/products?limit=8&depth=1&sort=-createdAt' },
  { key: 'bookings', label: 'Bookings', icon: CalendarDays,color: '#f5a623', endpoint: '/api/payload/bookings?limit=8&depth=1&sort=-createdAt' },
] as const
type Tab = typeof TABS[number]['key']

function ContentFeed() {
  const [active, setActive] = useState<Tab>('posts')
  const [data, setData] = useState<Record<string, ContentItem[]>>({})
  const [loading, setLoading] = useState(false)

  const load = (tab: Tab) => {
    if (data[tab]) return
    const t = TABS.find(t => t.key === tab)!
    setLoading(true)
    fetch(t.endpoint).then(r => r.json()).then(res => {
      setData(d => ({ ...d, [tab]: res?.data?.docs || [] }))
    }).catch(() => setData(d => ({ ...d, [tab]: [] }))).finally(() => setLoading(false))
  }

  useEffect(() => { load('posts') }, [])

  const tab = TABS.find(t => t.key === active)!
  const items = data[active] || []

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip */}
      <div className="flex gap-1 mb-3">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = t.key === active
          return (
            <button
              key={t.key}
              onClick={() => { setActive(t.key); load(t.key) }}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors"
              style={{
                color: isActive ? t.color : '#7788aa',
                background: isActive ? `${t.color}10` : 'transparent',
              }}
            >
              <Icon className="size-3" />
              {t.label}
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-1 right-1 h-px rounded-full"
                  style={{ background: t.color }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-none">
        {loading ? (
          <div className="py-6 text-center">
            <RefreshCw className="size-4 mx-auto text-muted-foreground animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No {tab.label.toLowerCase()} found.
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-1"
            >
              {items.map(it => (
                <div
                  key={it.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/6 bg-white/3 hover:border-white/12 hover:bg-white/5 transition-all group"
                >
                  <tab.icon className="size-3.5 shrink-0" style={{ color: tab.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{it.title || '(Untitled)'}</div>
                    {it.tenant && <div className="text-[9px] text-muted-foreground">{it.tenant.name}</div>}
                  </div>
                  {it._status && (
                    <span
                      className="text-[9px] font-mono px-1 py-0.5 rounded border shrink-0"
                      style={{
                        color: it._status === 'published' ? '#22cc88' : '#f5a623',
                        borderColor: it._status === 'published' ? '#22cc8840' : '#f5a62340',
                        background: it._status === 'published' ? '#22cc8808' : '#f5a62308',
                      }}
                    >
                      {it._status}
                    </span>
                  )}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Link to full page */}
      <Link
        href={`/content/${active}`}
        className="flex items-center justify-between mt-3 pt-3 border-t border-white/8 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group"
      >
        <span>View all {tab.label}</span>
        <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  )
}

/* ─── Quick action button ───────────────────────────────────────────── */
function QuickAction({ label, icon: Icon, color, href, external }: {
  label: string; icon: React.ElementType; color: string; href: string; external?: boolean
}) {
  const inner = (
    <motion.div
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.96 }}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/8 bg-white/4 hover:bg-white/7 hover:border-white/14 transition-colors cursor-pointer group"
    >
      <div className="size-9 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
        <Icon className="size-4" />
      </div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors text-center leading-tight">
        {label}
      </span>
    </motion.div>
  )
  return external
    ? <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <Link href={href}>{inner}</Link>
}

/* ─── Main page ─────────────────────────────────────────────────────── */
export default function BridgePage() {
  const [sys, setSys] = useState<SystemData | null>(null)
  const [cameras, setCameras] = useState<Camera[]>([])

  useEffect(() => {
    const load = () => fetch('/api/system').then(r => r.json()).then(setSys).catch(() => {})
    load()
    const iv = setInterval(load, 15_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    fetch('/api/cameras').then(r => r.json()).then(d => setCameras(d.cameras || [])).catch(() => {})
  }, [])

  const memPct = sys ? Math.round((sys.system.memory.used / sys.system.memory.total) * 100) : 0

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <motion.div variants={item} className="flex items-end justify-between">
        <div>
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
            className="flex items-center gap-2 mb-2"
          >
            {/* LCARS decorative bars — answer53 style */}
            <div className="flex gap-0.5">
              <motion.div className="w-0.5 h-6 rounded-full bg-lcars-amber" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.1, duration: 0.5 }} style={{ originY: 1 }} />
              <motion.div className="w-0.5 h-6 rounded-full bg-lcars-blue" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.15, duration: 0.5 }} style={{ originY: 1 }} />
              <motion.div className="w-0.5 h-6 rounded-full bg-lcars-purple" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.2, duration: 0.5 }} style={{ originY: 1 }} />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber/70">
              Bridge Console · Stardate {new Date().toISOString().slice(0, 10)}
            </span>
          </motion.div>
          <h1 className="text-3xl font-mono font-semibold tracking-tight">Welcome back, Captain.</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sys?.angels.online
              ? `Angel OS responding · ${sys.angels.responseMs}ms`
              : 'All systems standing by. Ad Astra.'
            }
          </p>
        </div>
        {/* Animated LCARS right bars */}
        <div className="hidden lg:flex flex-col gap-1 items-end">
          {['#f5a623','#99ccff','#22cc88','#cc99cc','#9977aa'].map((c, i) => (
            <motion.div
              key={c}
              className="h-0.5 rounded-full"
              style={{ background: c, width: `${40 - i * 6}px` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.2 + i * 0.05, duration: 0.4 }}
            />
          ))}
        </div>
      </motion.div>

      {/* ── Stat cards ────────────────────────────────────────────────── */}
      <motion.div variants={container} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Angels Bridge"
          value={sys?.angels.online ? 'ONLINE' : sys ? 'OFFLINE' : '···'}
          sub={sys?.angels.responseMs !== null ? `${sys?.angels.responseMs}ms` : 'Fallback: cache'}
          icon={Radio}
          accent={sys?.angels.online ? '#22cc88' : '#f5a623'}
        />
        <StatCard
          label="Open Incidents"
          value={sys?.incidents.open ?? '···'}
          sub="alerts requiring action"
          icon={AlertTriangle}
          accent={sys?.incidents.open ? '#cc4444' : '#22cc88'}
          href="/inbox"
        />
        <StatCard
          label="Inbox"
          value={sys?.inbox.new ?? '···'}
          sub="new messages"
          icon={Inbox}
          accent="#99ccff"
          href="/inbox"
        />
        <StatCard
          label="Uptime"
          value={sys ? fmtUptime(sys.system.uptime) : '···'}
          sub={sys?.system.hostname}
          icon={Activity}
          accent="#cc99cc"
        />
        <StatCard
          label="Memory"
          value={`${memPct}%`}
          sub={`${sys?.system.cpus ?? '?'} cores · ${sys?.system.localIp || '···'}`}
          icon={Cpu}
          accent={memPct > 80 ? '#cc4444' : memPct > 60 ? '#f5a623' : '#22cc88'}
        />
      </motion.div>

      {/* ── Main 2-col ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Content feed — tabs */}
        <motion.div
          variants={item}
          className="lg:col-span-2 rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Content Registry</h2>
            <Link
              href="/content/posts"
              className="text-[10px] font-mono uppercase text-lcars-amber/70 hover:text-lcars-amber flex items-center gap-1 transition-colors"
            >
              Full Library <ArrowRight className="size-3" />
            </Link>
          </div>
          <ContentFeed />
        </motion.div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Camera preview */}
          <motion.div variants={item} className="rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Surveillance</h2>
              <Link href="/cameras" className="text-[10px] font-mono text-lcars-red/70 hover:text-lcars-red flex items-center gap-1 transition-colors">
                All Feeds <Camera className="size-3" />
              </Link>
            </div>
            {cameras.length === 0 ? (
              <div className="aspect-video rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center gap-2">
                <Camera className="size-8 text-white/20" />
                <span className="text-[10px] text-muted-foreground font-mono">No cameras configured</span>
                <Link href="/cameras" className="text-[10px] text-lcars-red/70 hover:text-lcars-red font-mono">Add Camera →</Link>
              </div>
            ) : (
              <div className={`grid gap-1.5 ${cameras.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {cameras.slice(0, 4).map(cam => (
                  <Link key={cam.id} href="/cameras">
                    <div className="aspect-video rounded-md bg-black/60 border border-white/8 overflow-hidden relative group">
                      {cam.snapshotUrl || cam.protocol === 'mjpeg' ? (
                        <img
                          src={`/api/cameras/${cam.id}/snapshot`}
                          alt={cam.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Camera className="size-5 text-white/20" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="text-[9px] font-mono text-white/80 truncate">{cam.name}</div>
                      </div>
                      {/* Live indicator */}
                      <div className="absolute top-1 right-1 flex items-center gap-1 bg-black/50 rounded px-1 py-0.5">
                        <span className="size-1 rounded-full bg-lcars-red liveness-dot" />
                        <span className="text-[8px] font-mono text-white/70">LIVE</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>

          {/* System diagnostics */}
          <motion.div variants={item} className="rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-4 flex-1">
            <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Diagnostics</h2>
            <div className="space-y-3">
              {/* Memory bar */}
              <div>
                <div className="flex justify-between text-[10px] font-mono mb-1">
                  <span className="flex items-center gap-1 text-muted-foreground"><Cpu className="size-3" /> Memory</span>
                  <span style={{ color: memPct > 80 ? '#cc4444' : memPct > 60 ? '#f5a623' : '#22cc88' }}>{memPct}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${memPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{ background: memPct > 80 ? '#cc4444' : memPct > 60 ? '#f5a623' : '#22cc88' }}
                  />
                </div>
              </div>
              {[
                { label: 'Host', value: sys?.system.hostname, icon: Server },
                { label: 'Local IP', value: sys?.system.localIp, icon: Wifi },
                { label: 'CPUs', value: sys?.system.cpus ? `${sys.system.cpus} cores` : undefined, icon: Cpu },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Icon className="size-3" />{label}</span>
                  <span className="font-mono text-foreground/90 truncate max-w-[100px]">{value || '···'}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <motion.div variants={item}>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <span className="inline-block w-4 h-px bg-lcars-amber/50" />
          Quick Access
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <QuickAction label="Create Post" icon={Plus} color="#99ccff" href="/content/posts" />
          <QuickAction label="Products" icon={ShoppingBag} color="#22cc88" href="/content/products" />
          <QuickAction label="New Booking" icon={CalendarDays} color="#f5a623" href="/content/bookings" />
          <QuickAction label="Orders" icon={Package} color="#22cc88" href="/content/orders" />
          <QuickAction label="LEO AI" icon={Sparkles} color="#cc99cc" href="/leo" />
          <QuickAction label="YouTube" icon={Youtube} color="#cc4444" href="/youtube" />
          <QuickAction label="Admin" icon={Globe} color="#99ccff" href="https://www.spacesangels.com/admin" external />
          <QuickAction label="Studio" icon={BarChart3} color="#f5a623" href="https://studio.youtube.com" external />
        </div>
      </motion.div>

      {/* ── Activity log ─────────────────────────────────────────────── */}
      <motion.div variants={item} className="rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Officer Log · Recent Activity</h2>
          <Link href="/log" className="text-[10px] font-mono uppercase text-lcars-amber/70 hover:text-lcars-amber flex items-center gap-1 transition-colors">
            Full Log <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="space-y-0.5">
          {sys?.recentActivity?.slice(0, 8).map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 py-1.5 border-b border-white/4 last:border-0 text-xs"
            >
              <div className="size-1.5 rounded-full shrink-0" style={{ background: TYPE_DOT[entry.type] || '#7788aa' }} />
              <span className="text-muted-foreground font-mono shrink-0 w-16 tabular-nums">
                {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[9px] font-mono uppercase tracking-wider shrink-0 w-20 truncate" style={{ color: TYPE_DOT[entry.type] || '#7788aa' }}>
                {entry.type}
              </span>
              <span className="text-foreground/80 truncate flex-1">{entry.message}</span>
            </motion.div>
          ))}
          {!sys?.recentActivity?.length && (
            <div className="py-8 text-center text-xs text-muted-foreground">No activity yet. Systems standing by.</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
