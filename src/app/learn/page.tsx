'use client'
/**
 * /learn — NIMUE System Guide
 * Combines the Angel OS /learn module style with answer53's
 * Framer Motion visual language: stagger entrance, spring cards,
 * orbital icons, animated bars, floating glows.
 *
 * Teaches: what NIMUE is, how each section works, how to configure,
 * how to extend. Self-documenting control panel.
 */
import { useState, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import Link from 'next/link'
import {
  LayoutDashboard, Monitor, Radio, Camera, Hash, Sparkles,
  BookOpen, ShoppingBag, Package, CalendarDays, Server, Box,
  Youtube, Key, FileText, Image, MapPin, Inbox, Film,
  ChevronRight, ChevronDown, ArrowRight, Globe, Wifi, Lock,
  Zap, Shield, Brain, Network, Layers, GitBranch,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Module {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  color: string
  glow: string
  sections: Section[]
}
interface Section {
  id: string
  title: string
  icon?: React.ReactNode
  content: React.ReactNode
}

/* ─── Framer variants ────────────────────────────────────────────────── */
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
}
const card = {
  hidden: { opacity: 0, y: 32, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
}
const float = {
  animate: { y: [0, -6, 0], transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const } },
}
const pulseGlow = {
  animate: {
    opacity: [0.4, 0.8, 0.4],
    scale: [1, 1.08, 1],
    transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' as const },
  },
}
const barGrow = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.7, ease: 'easeOut' as const } },
}

/* ─── LCARS bar ──────────────────────────────────────────────────────── */
function LcarsBar({ color, delay = 0, width = '100%' }: { color: string; delay?: number; width?: string }) {
  return (
    <motion.div
      variants={barGrow}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      style={{ originX: 0, background: color, width }}
      className="h-px rounded-full my-2 opacity-60"
      custom={delay}
    />
  )
}

/* ─── Section content renderer ───────────────────────────────────────── */
function ModuleCard({ mod }: { mod: Module }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      variants={card}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      whileHover={{ scale: 1.01 }}
      className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm overflow-hidden"
      style={{ boxShadow: open ? `0 0 40px ${mod.glow}15` : 'none', transition: 'box-shadow 0.3s' }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 p-6 text-left group"
      >
        {/* Floating icon */}
        <motion.div
          variants={float}
          animate="animate"
          className="size-14 rounded-xl flex items-center justify-center shrink-0 relative"
          style={{ background: `${mod.color}12`, color: mod.color }}
        >
          <motion.div
            variants={pulseGlow}
            animate="animate"
            className="absolute inset-0 rounded-xl"
            style={{ background: `radial-gradient(circle, ${mod.glow}30, transparent 70%)` }}
          />
          <div className="relative z-10">{mod.icon}</div>
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: `${mod.color}80` }}>
            Module
          </div>
          <h2 className="text-lg font-semibold font-mono">{mod.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{mod.subtitle}</p>
        </div>

        <div className="shrink-0 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <ChevronDown className="size-5 text-muted-foreground" />
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-5 border-t border-white/6">
              <LcarsBar color={mod.color} />
              {mod.sections.map(sec => (
                <div key={sec.id} className="space-y-2">
                  {sec.icon && (
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest" style={{ color: `${mod.color}cc` }}>
                      <div className="size-4">{sec.icon}</div>
                      {sec.title}
                    </div>
                  )}
                  <div className="text-sm text-foreground/80 leading-relaxed">
                    {sec.content}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── Module definitions ─────────────────────────────────────────────── */
const MODULES: Module[] = [
  {
    id: 'browser-setup',
    title: 'Browser Setup',
    subtitle: 'HTTPS, secure context, PWA install, TV & embedded browsers',
    icon: <Shield className="size-6" />,
    color: '#22cc88',
    glow: '#22cc88',
    sections: [
      {
        id: 'secure-context',
        title: 'Why HTTPS matters (even on your LAN)',
        icon: <Lock className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>Modern browsers restrict many APIs to <strong className="text-foreground">secure contexts</strong> — only <code className="text-[11px] bg-white/6 px-1 rounded font-mono">https://</code>, <code className="text-[11px] bg-white/6 px-1 rounded font-mono">localhost</code>, and <code className="text-[11px] bg-white/6 px-1 rounded font-mono">127.0.0.1</code> qualify. Plain HTTP over a LAN IP (e.g. <code className="text-[11px] bg-white/6 px-1 rounded font-mono">http://192.168.0.234:3000</code>) does <em>not</em>.</p>
            <p>In a non-secure context, these APIs are <strong className="text-foreground">undefined</strong>:</p>
            <ul className="list-disc list-inside space-y-1 text-[13px] text-muted-foreground ml-2">
              <li><code className="text-[11px] bg-white/6 px-1 rounded font-mono">crypto.subtle</code> — SHA-256 hashing (Nimue inventory dedupe)</li>
              <li><code className="text-[11px] bg-white/6 px-1 rounded font-mono">crypto.randomUUID</code> — UUID generation</li>
              <li><code className="text-[11px] bg-white/6 px-1 rounded font-mono">navigator.geolocation</code> — GPS tagging for photo inventory</li>
              <li>Service Workers &amp; Push Notifications — PWA offline cache</li>
              <li><code className="text-[11px] bg-white/6 px-1 rounded font-mono">getUserMedia</code> — camera/microphone for Spaces (LiveKit)</li>
            </ul>
            <p>Nimue gracefully degrades where it can (FNV-1a fallback for hashing), but for the full experience — especially Spaces and PWA install — use HTTPS.</p>
          </div>
        ),
      },
      {
        id: 'dev-https',
        title: 'Enable HTTPS in dev',
        icon: <Key className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>Next.js 15 bakes in a dev-mode TLS server. We&apos;ve wired it up as a script:</p>
            <pre className="text-[11px] bg-white/6 p-3 rounded font-mono border border-white/6 overflow-x-auto">pnpm dev:https</pre>
            <p>On first run it prompts to install <strong className="text-foreground">mkcert</strong>, generates a local root CA + a cert for <code className="text-[11px] bg-white/6 px-1 rounded font-mono">0.0.0.0</code> and <code className="text-[11px] bg-white/6 px-1 rounded font-mono">localhost</code> under <code className="text-[11px] bg-white/6 px-1 rounded font-mono">.next/</code>, and boots on <code className="text-[11px] bg-white/6 px-1 rounded font-mono">https://192.168.0.234:3000</code> (or whatever your LAN IP is).</p>
            <p>The browser will warn about the self-signed cert on devices other than the dev machine. Click <em>Advanced → Proceed anyway</em> — the origin still counts as secure-context once you click through, so <code className="text-[11px] bg-white/6 px-1 rounded font-mono">crypto.subtle</code> et al. start working.</p>
          </div>
        ),
      },
      {
        id: 'trust-cert',
        title: 'Trust the cert on other devices (optional)',
        icon: <Shield className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>If you want a clean green-lock experience on phones, tablets, or the TV (no warning page), install mkcert&apos;s root CA on those devices.</p>
            <p>On the dev machine:</p>
            <pre className="text-[11px] bg-white/6 p-3 rounded font-mono border border-white/6 overflow-x-auto">mkcert -CAROOT</pre>
            <p>That prints a path to <code className="text-[11px] bg-white/6 px-1 rounded font-mono">rootCA.pem</code>. Copy it to each device and import:</p>
            <ul className="list-disc list-inside space-y-1 text-[13px] text-muted-foreground ml-2">
              <li><strong className="text-foreground">Android:</strong> Settings → Security → Install from storage → pick rootCA.pem</li>
              <li><strong className="text-foreground">iOS:</strong> AirDrop or email the cert, open, Settings → Profile Downloaded → Install. Then Settings → General → About → Certificate Trust Settings → enable.</li>
              <li><strong className="text-foreground">Windows:</strong> Double-click → Install Certificate → Local Machine → Trusted Root Certification Authorities</li>
              <li><strong className="text-foreground">Android TV / LG webOS:</strong> Usually no user-accessible cert store. Click through the warning instead — secure context still activates.</li>
            </ul>
          </div>
        ),
      },
      {
        id: 'browser-compat',
        title: 'Browser compatibility matrix',
        icon: <Globe className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>Nimue uses modern CSS (<code className="text-[11px] bg-white/6 px-1 rounded font-mono">oklch()</code>, <code className="text-[11px] bg-white/6 px-1 rounded font-mono">color-mix()</code>) with sRGB hex fallbacks via <code className="text-[11px] bg-white/6 px-1 rounded font-mono">@supports</code>. Baseline:</p>
            <div className="space-y-1.5 font-mono text-[11px]">
              {[
                ['Chrome / Edge / Brave', '111+', 'Full support', '#22cc88'],
                ['Firefox', '113+', 'Full support', '#22cc88'],
                ['Safari / iOS Safari', '15.4+', 'Full support', '#22cc88'],
                ['Chrome Android', '111+', 'Full support', '#22cc88'],
                ['Samsung Internet', '22+', 'Full support', '#22cc88'],
                ['LG webOS TV', 'webOS 6+', 'sRGB fallback (no oklch)', '#f5a623'],
                ['BrowseHere (Android TV)', 'varies', 'sRGB fallback — works', '#f5a623'],
                ['IE / legacy Edge', '—', 'Unsupported', '#cc4444'],
              ].map(([browser, version, status, color]) => (
                <div key={browser} className="flex items-center gap-2 py-1 border-b border-white/6 last:border-0">
                  <div className="size-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-foreground flex-1 truncate">{browser}</span>
                  <span className="text-muted-foreground">{version}</span>
                  <span className="text-muted-foreground text-[10px] italic">{status}</span>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">On older webviews that don&apos;t parse <code className="text-[11px] bg-white/6 px-1 rounded font-mono">oklch()</code>, Nimue ships sRGB hex variables as the base layer — everything still renders, just in the fallback palette.</p>
          </div>
        ),
      },
      {
        id: 'install-pwa',
        title: 'Install as an app',
        icon: <Globe className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>Over HTTPS, Nimue installs as a Progressive Web App on every platform:</p>
            <ul className="list-disc list-inside space-y-1 text-[13px] text-muted-foreground ml-2">
              <li><strong className="text-foreground">Desktop Chrome/Edge:</strong> click the install icon in the URL bar (looks like a monitor with a down-arrow)</li>
              <li><strong className="text-foreground">iOS Safari:</strong> Share → Add to Home Screen</li>
              <li><strong className="text-foreground">Android Chrome:</strong> ⋮ → Install app</li>
              <li><strong className="text-foreground">LG TV / Smart TV:</strong> bookmark the URL — most TV browsers don&apos;t support real PWA install, but the bookmark gives you a one-tap launcher on the home screen</li>
            </ul>
            <p>Installed PWAs get their own icon, own window chrome (no URL bar), offline cache for content, and background sync for the inventory queue.</p>
          </div>
        ),
      },
      {
        id: 'tv-browser',
        title: 'TV & embedded browser tips',
        icon: <Monitor className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>TVs and set-top boxes ship old Chromium forks with slow update cycles. Things to know:</p>
            <ul className="list-disc list-inside space-y-1 text-[13px] text-muted-foreground ml-2">
              <li>Use <strong className="text-foreground">BrowseHere</strong> or <strong className="text-foreground">TV Bro</strong> on Android TV / Fire TV — both track mainline Chromium closely.</li>
              <li>LG webOS&apos; stock browser is usable on webOS 6+ (2021 sets and later). Older sets may fall back to the hex palette but still render.</li>
              <li>If the page loads completely unstyled, check DevTools remote (<code className="text-[11px] bg-white/6 px-1 rounded font-mono">chrome://inspect</code> from your desktop) — likely a pre-<code className="text-[11px] bg-white/6 px-1 rounded font-mono">@supports</code> CSS parse issue we missed.</li>
              <li>Hardware cursor / remote nav: every interactive element in Nimue is keyboard-focusable. Use the directional pad + OK button.</li>
              <li>4K 60fps video on the CIC display — TVs handle this natively. Leave the wall monitor on <code className="text-[11px] bg-white/6 px-1 rounded font-mono">/cic</code> for ambient battle-stations ambience.</li>
            </ul>
          </div>
        ),
      },
    ],
  },
  {
    id: 'bridge',
    title: 'Bridge',
    subtitle: 'Command center, real-time system health, activity log',
    icon: <LayoutDashboard className="size-6" />,
    color: '#f5a623',
    glow: '#f5a623',
    sections: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        icon: <LayoutDashboard className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>The <strong className="text-foreground">Dashboard</strong> is your at-a-glance command view. Five live stat cards show: Angel OS connection status, open incidents, inbox count, node uptime, and memory pressure. All data refreshes every 15 seconds.</p>
            <p>The <strong className="text-foreground">Content Registry</strong> tabs (Posts / Products / Bookings) pull live data from the Angel OS mothership via the Payload proxy. Click any item to open it in the admin panel.</p>
            <p>The <strong className="text-foreground">Quick Actions</strong> grid gives you one-click access to create content, jump to LEO, or open external tools like YouTube Studio.</p>
          </div>
        ),
      },
      {
        id: 'cic',
        title: 'CIC — Combat Information Center',
        icon: <Monitor className="size-3.5" />,
        content: (
          <p>A fully animated tactical display: warp-speed starfield background, LCARS radar sweep, tactical grid, subsystem bar meters, and live event ticker. Pure signal — no fluff. Think of it as the ship&apos;s bridge at battle stations. Great for a wall monitor or ambient display.</p>
        ),
      },
    ],
  },
  {
    id: 'content',
    title: 'Content',
    subtitle: 'All Angel OS content — posts, products, events, media',
    icon: <FileText className="size-6" />,
    color: '#99ccff',
    glow: '#4488cc',
    sections: [
      {
        id: 'proxy',
        title: 'How the Payload proxy works',
        icon: <Network className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>NIMUE proxies all <code className="text-[11px] bg-white/6 px-1 rounded font-mono">/api/payload/*</code> requests to the Angel OS mothership at <code className="text-[11px] bg-white/6 px-1 rounded font-mono">NEXT_PUBLIC_ANGELS_URL</code>. Responses are cached locally in <code className="text-[11px] bg-white/6 px-1 rounded font-mono">data/payload-cache/</code> with a 2-hour TTL via the service worker.</p>
            <p>The cache means content pages load instantly even when your internet is down or Angel OS is unreachable. The source badge (Live / Cached / Offline) shows you which you&apos;re seeing.</p>
          </div>
        ),
      },
      {
        id: 'tenant-filter',
        title: 'Tenant filtering',
        icon: <Layers className="size-3.5" />,
        content: (
          <p>The tenant picker in the sidebar scopes all content queries to a single Angel OS tenant (enterprise). Your selection is saved to device storage via <code className="text-[11px] bg-white/6 px-1 rounded font-mono">appStorage.setTenant()</code> and persists across sessions. On Android/iOS this uses Capacitor Preferences; on web it falls back to localStorage.</p>
        ),
      },
    ],
  },
  {
    id: 'commerce',
    title: 'Commerce',
    subtitle: 'Orders, bookings, and space management',
    icon: <ShoppingBag className="size-6" />,
    color: '#22cc88',
    glow: '#22cc88',
    sections: [
      {
        id: 'orders',
        title: 'Orders',
        icon: <Package className="size-3.5" />,
        content: <p>Stripe orders pulled from Angel OS via the Payload proxy. Filter by tenant or status. Click the external link icon to open an order in the Angel OS admin panel for editing or fulfillment actions.</p>,
      },
      {
        id: 'bookings',
        title: 'Bookings',
        icon: <CalendarDays className="size-3.5" />,
        content: <p>Reservations generated by the Angel OS BookingEngine. Includes slot availability, conflict detection, and harmonic resolution. For clearwater-cruisin, tours are booked here — not as products. LEO can create, cancel, and reschedule bookings conversationally.</p>,
      },
    ],
  },
  {
    id: 'communication',
    title: 'Communication',
    subtitle: 'Spaces (LiveKit), inbox, and LEO AI assistant',
    icon: <Hash className="size-6" />,
    color: '#cc99cc',
    glow: '#9977aa',
    sections: [
      {
        id: 'spaces',
        title: 'Spaces — LiveKit WebRTC',
        icon: <Hash className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p><strong className="text-foreground">Spaces</strong> is a full-featured voice and video room powered by LiveKit. Join any room by name; NIMUE mints a short-lived JWT token server-side using your LiveKit API key + secret.</p>
            <p>To self-host LiveKit: <code className="text-[11px] bg-white/6 px-1 rounded font-mono">docker run -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev</code>. Configure the URL and credentials in Keys &amp; Config.</p>
          </div>
        ),
      },
      {
        id: 'leo',
        title: 'LEO — Angel AI',
        icon: <Sparkles className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p><strong className="text-foreground">LEO</strong> (Local Entity Operator) is the Angel OS constitutional AI assistant. It routes through 4 model tiers (GPT-4 → Claude → Gemini → local Ollama) based on task complexity and credit availability.</p>
            <p>From NIMUE, LEO can: generate YouTube chapters from SRT, optimize descriptions, generate hashtags, manage content, create bookings, and help diagnose system issues. All via the Angel OS <code className="text-[11px] bg-white/6 px-1 rounded font-mono">/api/leo</code> stream endpoint.</p>
            <p>LEO has 118 tools across 15 engines. Use the chat tab for general questions; the specialized tabs (Chapters, Hashtags, Optimize) for YouTube workflow.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'surveillance',
    title: 'Surveillance',
    subtitle: 'IP cameras — MJPEG, HLS, RTSP live feeds',
    icon: <Camera className="size-6" />,
    color: '#cc4444',
    glow: '#cc4444',
    sections: [
      {
        id: 'protocols',
        title: 'Camera protocols',
        icon: <Camera className="size-3.5" />,
        content: (
          <div className="space-y-3">
            <div>
              <p className="font-mono text-[10px] text-lcars-red uppercase tracking-wider mb-1">MJPEG</p>
              <p className="text-sm text-muted-foreground">Most IP cameras. NIMUE proxies the HTTP stream through <code className="text-[11px] bg-white/6 px-1 rounded font-mono">/api/cameras/[id]/stream</code> so credentials never reach the browser. Works everywhere, no ffmpeg needed.</p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-lcars-blue uppercase tracking-wider mb-1">HLS</p>
              <p className="text-sm text-muted-foreground">Higher quality, adaptive bitrate. Requires nginx-rtmp or ffmpeg to convert RTSP → m3u8 segments. NIMUE serves the playlist and segments. Good for recordings.</p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-lcars-amber uppercase tracking-wider mb-1">RTSP direct</p>
              <p className="text-sm text-muted-foreground">Needs the nginx-rtmp-module config in <code className="text-[11px] bg-white/6 px-1 rounded font-mono">nginx-config/nimue.conf</code>. Run nginx on the same host as NIMUE to ingest RTSP and emit HLS.</p>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    subtitle: 'VMware, Kubernetes, Docker — all in one pane of glass',
    icon: <Server className="size-6" />,
    color: '#9977aa',
    glow: '#9977aa',
    sections: [
      {
        id: 'lan-discovery',
        title: 'LAN Discovery',
        icon: <Network className="size-3.5" />,
        content: <p>Click <strong className="text-foreground">Scan LAN</strong> on any Infrastructure page to probe your subnet for VMware ESXi (443, 8443), Kubernetes API (6443), Docker Engine (2375), Portainer (9000), Plex (32400), Jellyfin (8096), Home Assistant (8123), IP cameras (554, 80), and other Angel OS NIMUE nodes (3001, 3030). 800ms timeout per probe across 60+ hosts.</p>,
      },
      {
        id: 'proxies',
        title: 'Reverse proxy setup',
        icon: <Server className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>Set <code className="text-[11px] bg-white/6 px-1 rounded font-mono">VMWARE_URL</code> and <code className="text-[11px] bg-white/6 px-1 rounded font-mono">K8S_DASHBOARD_URL</code> in <code className="text-[11px] bg-white/6 px-1 rounded font-mono">.env.local</code>. NIMUE embeds those UIs via nginx reverse-proxy rewrites at <code className="text-[11px] bg-white/6 px-1 rounded font-mono">/proxy/vmware/</code> and <code className="text-[11px] bg-white/6 px-1 rounded font-mono">/proxy/kubernetes/</code>.</p>
            <p>Docker Engine: enable TCP API in Docker Desktop → Settings → General → &quot;Expose daemon on tcp://localhost:2375&quot;. NIMUE then auto-discovers containers via <code className="text-[11px] bg-white/6 px-1 rounded font-mono">/api/infra/docker</code>.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'pwa-native',
    title: 'PWA & Native Clients',
    subtitle: 'Install on Windows, Android, iOS — offline-capable everywhere',
    icon: <Globe className="size-6" />,
    color: '#f5a623',
    glow: '#f5a623',
    sections: [
      {
        id: 'pwa',
        title: 'Progressive Web App',
        icon: <Globe className="size-3.5" />,
        content: (
          <div className="space-y-2">
            <p>Open NIMUE in Chrome or Edge, click the install button in the address bar, and it installs like a native app with its own icon, offline cache, and window chrome. Works on any OS.</p>
            <p>Service worker caches <code className="text-[11px] bg-white/6 px-1 rounded font-mono">/api/payload/*</code> responses for 2 hours (StaleWhileRevalidate), camera snapshots for 30 seconds (NetworkFirst), and static assets permanently (CacheFirst).</p>
          </div>
        ),
      },
      {
        id: 'tauri',
        title: 'Windows system-tray (Sprint 47)',
        icon: <Box className="size-3.5" />,
        content: <p>Tauri 2 wraps NIMUE in a ~10 MB signed Windows MSI with a system-tray icon. Menu: Open NIMUE · Cameras · Spaces · LEO · discovered nodes · quit. Auto-starts on login. Uses WebView2 (ships with Windows 10+) so LiveKit WebRTC works natively.</p>,
      },
      {
        id: 'capacitor',
        title: 'Android & iOS (Sprint 48–49)',
        icon: <Wifi className="size-3.5" />,
        content: <p>Capacitor 6 wraps the same Next.js build. <code className="text-[11px] bg-white/6 px-1 rounded font-mono">npx cap add android/ios</code>, configure <code className="text-[11px] bg-white/6 px-1 rounded font-mono">com.angels.nimue</code>, build the AAB/IPA. Storage is already abstracted via <code className="text-[11px] bg-white/6 px-1 rounded font-mono">src/lib/storage.ts</code> — Capacitor Preferences on device, localStorage in the browser.</p>,
      },
    ],
  },
  {
    id: 'configuration',
    title: 'Configuration',
    subtitle: 'Keys, API credentials, environment setup',
    icon: <Key className="size-6" />,
    color: '#7788aa',
    glow: '#9977aa',
    sections: [
      {
        id: 'env',
        title: 'Environment variables',
        icon: <Lock className="size-3.5" />,
        content: (
          <div className="space-y-1.5 font-mono text-[11px]">
            {[
              ['NEXT_PUBLIC_ANGELS_URL', 'Angel OS origin (e.g. https://www.spacesangels.com)'],
              ['ANGELS_API_KEY', 'API key from Angel OS admin → API Keys'],
              ['LIVEKIT_SERVER_URL', 'wss://your-livekit.example.com'],
              ['LIVEKIT_API_KEY / SECRET', 'From your LiveKit server config'],
              ['VMWARE_URL', 'https://192.168.1.x (ESXi host)'],
              ['K8S_DASHBOARD_URL', 'http://localhost:8001 (kubectl proxy)'],
              ['YOUTUBE_API_KEY', 'From Google Cloud Console (YouTube Data API v3)'],
            ].map(([key, desc]) => (
              <div key={key} className="flex flex-col gap-0.5 py-1.5 border-b border-white/6 last:border-0">
                <code className="text-lcars-amber text-[11px]">{key}</code>
                <span className="text-muted-foreground text-[11px]">{desc}</span>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: 'ui-config',
        title: 'UI configuration',
        icon: <Key className="size-3.5" />,
        content: (
          <p>Go to <Link href="/keys" className="text-lcars-amber hover:underline">Keys &amp; Config</Link> in the sidebar to set LiveKit credentials, YouTube API key, and other secrets via the UI. Changes are persisted to the local JSON store at <code className="text-[11px] bg-white/6 px-1 rounded font-mono">data/keys.json</code>.</p>
        ),
      },
    ],
  },
]

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function LearnPage() {
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="space-y-4"
      >
        {/* LCARS decorative column */}
        <motion.div className="flex items-start gap-4">
          <div className="flex flex-col gap-1 pt-2 shrink-0">
            {['#f5a623','#99ccff','#22cc88','#cc99cc','#9977aa','#cc4444'].map((c, i) => (
              <motion.div
                key={c}
                className="rounded-full"
                style={{ background: c, width: '3px', height: `${16 + i * 4}px` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
              />
            ))}
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber/70 mb-2">
              ── System Guide · NIMUE v3
            </div>
            <h1 className="text-4xl font-mono font-semibold tracking-tight">Learn NIMUE</h1>
            <p className="text-base text-muted-foreground mt-2 leading-relaxed">
              The Angel OS control panel. Local node, offline-first, LAN-served.
              Understand every module — then bend it to your mission.
            </p>
          </div>
        </motion.div>

        {/* Animated horizontal bar */}
        <motion.div
          className="h-px w-full rounded-full"
          style={{ background: 'linear-gradient(to right, #f5a623, #99ccff, #22cc88, #cc99cc, #9977aa)' }}
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: 'easeOut' }}
        />

        {/* Module count */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground"
        >
          <span><span className="text-foreground font-semibold">{MODULES.length}</span> modules</span>
          <span>·</span>
          <span><span className="text-foreground font-semibold">{MODULES.reduce((a, m) => a + m.sections.length, 0)}</span> sections</span>
          <span>·</span>
          <span>Click a module to expand</span>
        </motion.div>
      </motion.div>

      {/* Module grid */}
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
        {MODULES.map(mod => (
          <ModuleCard key={mod.id} mod={mod} />
        ))}
      </motion.div>

      {/* Footer CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="border border-white/8 bg-white/3 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4"
      >
        <motion.div variants={pulseGlow} animate="animate" className="size-14 rounded-xl flex items-center justify-center" style={{ background: '#cc99cc15', color: '#cc99cc' }}>
          <Sparkles className="size-6" />
        </motion.div>
        <div className="flex-1 text-center sm:text-left">
          <div className="font-mono text-sm font-semibold">Talk to LEO</div>
          <div className="text-xs text-muted-foreground mt-0.5">LEO can answer questions about NIMUE, configure settings, and help you get things done conversationally.</div>
        </div>
        <Link
          href="/leo"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-sm text-black font-semibold"
          style={{ background: '#cc99cc' }}
        >
          Open LEO <ArrowRight className="size-4" />
        </Link>
      </motion.div>
    </div>
  )
}
