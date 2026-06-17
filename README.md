# JARVIS — Angel OS Local Node

**v3.0.0** · Progressive Web App · Offline-first · LAN-served

JARVIS is the desktop/mobile client and local compute node for the [Angel OS](https://www.spacesangels.com) platform. It runs on any machine on your LAN (Windows, Mac, Linux) and exposes a full-featured web UI that installs as a PWA — works like a native app on phones, tablets, Google TV, and desktops.

---

## What This Is

Angel OS is a multi-tenant platform for creators, churches, ministries, and small businesses. JARVIS is the **offline-capable local satellite** that:

- Caches Angel OS content locally so it works without internet
- Streams your local video library to any device on the LAN
- Monitors IP cameras with real-time MJPEG/HLS feeds
- Powers voice/video Spaces via LiveKit
- Proxies VMware, Kubernetes, and Docker dashboards through a unified interface
- Acts as an edge ingest node — processes media, uploads to Vercel Blob, syncs to Angel OS
- Hosts the book viewer for WDEG (Walk with David, Every Generation) in multilingual read-aloud mode

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Set your Angel OS API credentials
cp .env.example .env.local
# Edit .env.local with your Angel OS URL + API key

# Start the server (binds to 0.0.0.0 so LAN devices can reach it)
pnpm dev

# Access from any device on your LAN:
# http://<your-ip>:3000
```

### Install as PWA

1. Open `http://<your-ip>:3000` in Chrome/Edge/Safari
2. Click the "Install" button in the address bar (or Share → Add to Home Screen on iOS)
3. JARVIS installs as a standalone app with its own icon and offline support

---

## Navigation

```
JARVIS (left sidebar)
│
├── BRIDGE
│   ├── Dashboard      — System health, Angels status, activity feed
│   ├── CIC            — Intelligence Center (LCARS tactical display)
│   └── Activity Log   — All events in chronological order
│
├── CONTENT  (mirrored from Angel OS)
│   ├── Pages          — Site pages across all tenants
│   ├── Posts          — Blog posts (read + admin link)
│   ├── Products       — Product catalog with pricing
│   ├── Events         — Calendar events
│   └── Media          — File registry + local watcher
│
├── COMMERCE
│   ├── Orders         — Stripe orders
│   ├── Bookings       — Booking engine reservations
│   └── Spaces Mgr     — Bookable venue/space management
│
├── COMMUNICATION
│   ├── Spaces         — Real-time voice/video via LiveKit + chat
│   ├── Inbox          — Messages + incidents
│   └── LEO — AI       — Conversational AI assistant
│
├── SURVEILLANCE
│   ├── Cameras        — IP camera grid (MJPEG, HLS, RTSP→HLS)
│   └── Recording      — DVR clips, motion events (Sprint 46)
│
├── INFRASTRUCTURE
│   ├── VMware         — vSphere embedded (via nginx proxy)
│   ├── Kubernetes     — K8s Dashboard embedded
│   └── Docker         — Container list via Docker Engine API
│
└── SYSTEM
    ├── YouTube        — Channel stats + video management
    └── Keys & Config  — API keys, LiveKit, settings
```

---

## IP Camera Setup

JARVIS supports three camera protocols:

### MJPEG (simplest — most IP cameras)
Most cameras expose a direct MJPEG stream over HTTP. JARVIS proxies the stream so auth credentials never leave the server.

```
Protocol: MJPEG (HTTP)
IP: 192.168.1.x
Port: 80
MJPEG Path: /video  (or /cgi-bin/mjpg/video.cgi for Hikvision/Dahua)
Snapshot Path: /snapshot
```

### HLS (for higher quality / lower latency)
If you run nginx with RTMP module or ffmpeg on the server, convert RTSP to HLS first:

```bash
ffmpeg -i rtsp://user:pass@192.168.1.x:554/stream1 \
  -c:v copy -c:a aac -f hls \
  -hls_time 2 -hls_list_size 5 \
  /var/www/hls/cam1/index.m3u8
```

Then add camera with Protocol: HLS and the m3u8 URL.

### RTSP (direct — requires nginx)
See `nginx-config/rtsp-to-hls.conf` for the full nginx-rtmp-module configuration.

---

## LiveKit Voice / Video

Spaces supports real-time voice and video using LiveKit (open-source WebRTC infrastructure).

### Self-hosted LiveKit
```bash
docker run -d \
  -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: devsecret" \
  livekit/livekit-server --dev
```

### Configure in JARVIS
Go to Keys → LiveKit and set:
- **Server URL**: `wss://your-livekit-server.example.com` (or `ws://localhost:7880` for local)
- **API Key**: from your LiveKit config
- **API Secret**: from your LiveKit config

---

## Infrastructure Proxying

### Docker Desktop
Enable the TCP API in Docker Desktop → Settings → General → "Expose daemon on tcp://localhost:2375"

JARVIS will then show all containers in Infrastructure → Docker.

### VMware / Kubernetes
Set these in `.env.local`:
```
VMWARE_URL=https://192.168.1.x
K8S_DASHBOARD_URL=http://localhost:8001
```

JARVIS embeds these dashboards via iframe with nginx reverse-proxy passthrough.

---

## LAN Discovery

Navigate to any Infrastructure page and click "Scan LAN" to auto-discover:
- VMware ESXi hosts (port 443, 8443)
- Kubernetes API servers (port 6443)
- Docker Engine (port 2375)
- Portainer (port 9000)
- Plex (port 32400), Jellyfin (port 8096)
- Home Assistant (port 8123)
- IP cameras (port 80, 554 RTSP)
- Other Angel OS nodes (port 3001, 3030)

---

## PWA / App Store Distribution

JARVIS is a Progressive Web App. For distribution:

### Web (today)
Any browser on any device can install via the browser's "Add to Home Screen" / "Install App" prompt.

### Windows desktop — Tauri 2 with system tray (Sprint 47)
```bash
pnpm add -D @tauri-apps/cli
pnpm tauri init
# See docs/client-strategy.md for tray layout + auto-start details
```

Tauri 2 gives us a ~10 MB signed MSI with a persistent system-tray icon
(Open JARVIS · Cameras · Spaces · LEO · discovered LAN nodes · quit).
WebView2 ships on all Win10+ boxes, so LiveKit WebRTC works out of the box.

### Capacitor (iOS/Android app stores) — Sprint 48–49
```bash
pnpm add @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init
npx cap add ios
npx cap add android
# Build and submit to App Store / Play Store
```

Capacitor wraps the web app in a native shell — same codebase, native
install experience. Storage already abstracted via `src/lib/storage.ts`
so Capacitor Preferences is used on device, `localStorage` in the PWA.

See [`docs/client-strategy.md`](docs/client-strategy.md) for the full
Windows tray + Android + iOS rollout plan.

---

## WDEG Book Integration

The book viewer from WDEG (Walk with David, Every Generation — `C:\Dev\wdeg`) integrates as:
- `/book` route — full book reader with chapter navigation
- Multilingual support via Angel OS's locale system
- Text-to-speech read-aloud in the user's preferred language
- Offline reading via service worker cache
- WDEG is registered as a tenant on spacesangels.com with community features (Spaces, events, prayer requests)

See `src/app/book/` (Sprint 46) for implementation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    JARVIS Local Node                     │
│  Next.js 15 · React 19 · Tailwind · SQLite/JSON store   │
├─────────────────────────────────────────────────────────┤
│  PWA (offline) ←→ Service Worker ←→ Workbox cache       │
├──────────────┬──────────────────────┬───────────────────┤
│  Content     │  Real-time           │  Infrastructure   │
│  (cached)    │                      │  (proxied)        │
│              │  LiveKit (WebRTC)    │                   │
│  Pages       │  IP Camera MJPEG/HLS │  VMware vSphere   │
│  Posts       │  SSE streams         │  Kubernetes       │
│  Products    │  Angel OS sync       │  Docker Engine    │
│  Media       │                      │                   │
└──────┬───────┴──────────┬───────────┴───────────────────┘
       │                  │
       ▼                  ▼
  Angel OS           LiveKit Server
  (spacesangels.com) (self-hosted or cloud)
  Payload CMS        wss://your-livekit
  PostgreSQL
```

---

## Roadmap

| Sprint | Feature |
|--------|---------|
| ✅ Current | Left sidebar nav, IP cameras, LiveKit Spaces, content pages, PWA, book viewer, storage abstraction |
| 46 | Recording engine (ffmpeg DVR, motion clips), WDEG book content import, LEO system-maintenance tools |
| 47 | **Windows tray app (Tauri 2)** — signed MSI, auto-start, discovered-nodes menu · LAN discovery UI · OAuth (Google + Twitter/X) · mDNS `_jarvis._tcp.local` |
| 48 | **Android client (Capacitor 6)** — Play Store closed beta, mDNS discovery, FCM push for camera motion |
| 49 | **iOS client (Capacitor 6)** — TestFlight, APNs, Sign in with Apple, privacy manifest |
| 50 | Public release: Windows MSI on spaces-angels.com/download · Play Store · App Store submit · Tauri auto-updater |
| 51+ | Multi-node federation (JARVIS nodes discover each other on LAN + sync state) |

---

## Configuration (`.env.local`)

```env
# Angel OS mothership
NEXT_PUBLIC_ANGELS_URL=https://www.spacesangels.com
ANGELS_API_KEY=your-api-key

# Infrastructure proxies (optional)
VMWARE_URL=https://192.168.1.x
K8S_DASHBOARD_URL=http://localhost:8001

# LiveKit (optional — configure via UI in Keys)
LIVEKIT_SERVER_URL=wss://your-livekit.example.com
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# Twitter/X OAuth (Sprint 47)
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
```

---

## Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 | App router, streaming, API routes |
| UI | Tailwind + shadcn/ui | LCARS theme, fast iteration |
| State | React 19 state | No external store needed |
| Persistence | JSON file store | Zero deps, works offline |
| Camera | MJPEG proxy API | No browser CORS issues |
| Voice/Video | LiveKit | Open-source WebRTC, self-hostable |
| PWA | @ducanh2912/next-pwa | Workbox-powered offline cache |
| Icons | Lucide | Consistent, tree-shakeable |

---

*Part of the Angel OS ecosystem · Ad Astra*
