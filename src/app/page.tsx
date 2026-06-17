'use client'
/**
 * Merlin — Node Dashboard.
 * A controller node for the personal-area network: serves local media, runs the
 * ingest queue, and connects to the Angel OS federation through its initial node.
 * Live data from /api/system + /api/movies/roots + the local ingest queue.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Activity, Radio, Cpu, Wifi, ArrowRight, Sparkles, Camera,
  RefreshCw, Youtube, Server, Upload, FolderOpen, HardDrive, ExternalLink,
} from 'lucide-react'
import { useInventoryQueue } from '@/hooks/useInventoryQueue'

const ANGELS_PORTAL = process.env.NEXT_PUBLIC_ANGELS_URL || 'https://spacesangels.com'

/* ─── Types ─────────────────────────────────────────────────────────── */
interface SystemData {
  system: { uptime: number; hostname: string; localIp: string; cpus: number; memory: { used: number; total: number } }
  angels: { online: boolean; responseMs: number | null; lastChecked: string | null }
  recentActivity: Array<{ id: string; timestamp: string; type: string; source: string; message: string }>
}
interface MediaRoot { path: string; label?: string; enabled?: boolean }
interface Cam { id: string; name: string; snapshotUrl?: string; protocol: string }

/* ─── Animation variants ────────────────────────────────────────────── */
const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }
const item = { hidden: { opacity: 0, y: 24, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 280, damping: 28 } } }

/* ─── Helpers ───────────────────────────────────────────────────────── */
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`; if (h) return `${h}h ${m}m`; return `${m}m`
}
function baseName(p: string) { return p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p }

const TYPE_DOT: Record<string, string> = {
  incident: '#cc4444', error: '#cc4444', angels: '#22cc88', file_arrived: '#99ccff',
  youtube_update: '#cc99cc', system: '#7788aa', info: '#99ccff', api_call: '#f5a623',
}

/* ─── Animated stat card ────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, accent = '#f5a623', href }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; accent?: string; href?: string
}) {
  const Inner = (
    <motion.div variants={item} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
      className="relative flex items-center gap-4 rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-4 cursor-pointer group overflow-hidden">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}12, transparent 70%)` }} />
      <div className="absolute left-0 top-3 bottom-3 w-px rounded-r-full" style={{ background: accent }} />
      <div className="size-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}12`, color: accent }}>
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0 relative z-10">
        <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: `${accent}99` }}>{label}</div>
        <div className="text-2xl font-mono tabular-nums font-semibold leading-tight">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
      </div>
    </motion.div>
  )
  return href ? <Link href={href}>{Inner}</Link> : Inner
}

/* ─── Quick action button ───────────────────────────────────────────── */
function QuickAction({ label, icon: Icon, color, href, external }: {
  label: string; icon: React.ElementType; color: string; href: string; external?: boolean
}) {
  const inner = (
    <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/8 bg-white/4 hover:bg-white/7 hover:border-white/14 transition-colors cursor-pointer group">
      <div className="size-9 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
        <Icon className="size-4" />
      </div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors text-center leading-tight">{label}</span>
    </motion.div>
  )
  return external
    ? <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <Link href={href}>{inner}</Link>
}

/* ─── Media library panel ───────────────────────────────────────────── */
function MediaPanel() {
  const [roots, setRoots] = useState<MediaRoot[] | null>(null)
  useEffect(() => {
    fetch('/api/movies/roots').then(r => r.json()).then(d => setRoots(d.roots || [])).catch(() => setRoots([]))
  }, [])

  return (
    <div className="flex flex-col h-full">
      {roots === null ? (
        <div className="py-6 text-center"><RefreshCw className="size-4 mx-auto text-muted-foreground animate-spin" /></div>
      ) : roots.length === 0 ? (
        <div className="py-8 text-center">
          <FolderOpen className="size-8 mx-auto text-white/20 mb-2" />
          <div className="text-xs text-muted-foreground">No media drives configured.</div>
          <Link href="/media" className="text-[10px] text-lcars-blue/70 hover:text-lcars-blue font-mono">Add a drive →</Link>
        </div>
      ) : (
        <div className="flex-1 space-y-1">
          {roots.map((r) => (
            <Link key={r.path} href={`/media?dir=${encodeURIComponent(r.path)}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/6 bg-white/3 hover:border-white/12 hover:bg-white/5 transition-all group">
              <HardDrive className="size-3.5 shrink-0 text-lcars-blue" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{r.label || baseName(r.path)}</div>
                <div className="text-[9px] text-muted-foreground font-mono truncate">{r.path}</div>
              </div>
              {r.enabled === false && <span className="text-[9px] font-mono text-muted-foreground">off</span>}
              <ArrowRight className="size-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>
      )}
      <Link href="/media" className="flex items-center justify-between mt-3 pt-3 border-t border-white/8 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group">
        <span>Browse all media</span>
        <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  )
}

/* ─── Main page ─────────────────────────────────────────────────────── */
export default function NodeDashboard() {
  const [sys, setSys] = useState<SystemData | null>(null)
  const [cameras, setCameras] = useState<Cam[]>([])
  const { stats: queue } = useInventoryQueue()

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
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      {/* ── Hero ── */}
      <motion.div variants={item} className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-0.5">
              <div className="w-0.5 h-6 rounded-full bg-lcars-amber" />
              <div className="w-0.5 h-6 rounded-full bg-lcars-blue" />
              <div className="w-0.5 h-6 rounded-full bg-lcars-purple" />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber/70">
              Merlin Node · {sys?.system.hostname || '···'} · {new Date().toISOString().slice(0, 10)}
            </span>
          </div>
          <h1 className="text-3xl font-mono font-semibold tracking-tight">Merlin online.</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sys?.angels.online ? `Federation linked · ${sys.angels.responseMs}ms` : 'Local node standing by. Ad Astra.'}
          </p>
        </div>
        <div className="hidden lg:flex flex-col gap-1 items-end">
          {['#f5a623','#99ccff','#22cc88','#cc99cc','#9977aa'].map((c, i) => (
            <motion.div key={c} className="h-0.5 rounded-full" style={{ background: c, width: `${40 - i * 6}px` }}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.2 + i * 0.05, duration: 0.4 }} />
          ))}
        </div>
      </motion.div>

      {/* ── Stat cards ── */}
      <motion.div variants={container} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Federation" value={sys?.angels.online ? 'LINKED' : sys ? 'LOCAL' : '···'}
          sub={sys?.angels.responseMs != null ? `${sys.angels.responseMs}ms` : 'connect via initial node'}
          icon={Radio} accent={sys?.angels.online ? '#22cc88' : '#f5a623'} href="/connect" />
        <StatCard label="Ingest Queue" value={queue.pending} sub={`${queue.total} total · ${queue.error} errors`}
          icon={Upload} accent={queue.error ? '#cc4444' : queue.pending ? '#f5a623' : '#22cc88'} href="/inventory" />
        <StatCard label="Cameras" value={cameras.length} sub="surveillance feeds"
          icon={Camera} accent="#cc4444" href="/cameras" />
        <StatCard label="Uptime" value={sys ? fmtUptime(sys.system.uptime) : '···'} sub={sys?.system.localIp}
          icon={Activity} accent="#cc99cc" />
        <StatCard label="Memory" value={`${memPct}%`} sub={`${sys?.system.cpus ?? '?'} cores`}
          icon={Cpu} accent={memPct > 80 ? '#cc4444' : memPct > 60 ? '#f5a623' : '#22cc88'} />
      </motion.div>

      {/* ── Main 2-col ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Media library */}
        <motion.div variants={item} className="lg:col-span-2 rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Media Library · Local Drives</h2>
            <Link href="/media" className="text-[10px] font-mono uppercase text-lcars-amber/70 hover:text-lcars-amber flex items-center gap-1 transition-colors">
              Browse <ArrowRight className="size-3" />
            </Link>
          </div>
          <MediaPanel />
        </motion.div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Cameras */}
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
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/cameras/${cam.id}/snapshot`} alt={cam.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><Camera className="size-5 text-white/20" /></div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="text-[9px] font-mono text-white/80 truncate">{cam.name}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>

          {/* Diagnostics */}
          <motion.div variants={item} className="rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-4 flex-1">
            <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Diagnostics</h2>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[10px] font-mono mb-1">
                  <span className="flex items-center gap-1 text-muted-foreground"><Cpu className="size-3" /> Memory</span>
                  <span style={{ color: memPct > 80 ? '#cc4444' : memPct > 60 ? '#f5a623' : '#22cc88' }}>{memPct}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${memPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{ background: memPct > 80 ? '#cc4444' : memPct > 60 ? '#f5a623' : '#22cc88' }} />
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

      {/* ── Quick actions ── */}
      <motion.div variants={item}>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <span className="inline-block w-4 h-px bg-lcars-amber/50" /> Quick Access
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <QuickAction label="Media" icon={FolderOpen} color="#99ccff" href="/media" />
          <QuickAction label="Ingest" icon={Upload} color="#ff9a4d" href="/inventory" />
          <QuickAction label="LEO AI" icon={Sparkles} color="#cc99cc" href="/leo" />
          <QuickAction label="Cameras" icon={Camera} color="#cc4444" href="/cameras" />
          <QuickAction label="Federation" icon={Radio} color="#99ccff" href="/connect" />
          <QuickAction label="YouTube" icon={Youtube} color="#cc4444" href="/youtube" />
          <QuickAction label="Angel OS Portal" icon={ExternalLink} color="#f5a623" href={ANGELS_PORTAL} external />
        </div>
      </motion.div>

      {/* ── Activity log ── */}
      <motion.div variants={item} className="rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Node Log · Recent Activity</h2>
          <Link href="/log" className="text-[10px] font-mono uppercase text-lcars-amber/70 hover:text-lcars-amber flex items-center gap-1 transition-colors">
            Full Log <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="space-y-0.5">
          {sys?.recentActivity?.slice(0, 8).map((entry, i) => (
            <motion.div key={entry.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 py-1.5 border-b border-white/4 last:border-0 text-xs">
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
