# Merlin — Angel OS Media Server & Local Node

Merlin is the **local/residential node** for [Angel OS](https://www.spacesangels.com). It runs on a machine you own (Windows/Mac/Linux, LAN-served on `:3000`) and gives Angel OS a body with a **residential IP, local disk, an on-box AI brain, and eyes on your cameras** — the things a cloud node structurally can't have.

It's a full **Payload CMS 3.77 + Next.js 15** app that talks to Core's Leo (or its own on-box brain) and echoes everything up to its channel on the Core AI Bus. One of the three bodies (Core · **Merlin** · Nimue), sharing the portable `@angel-os/brain`.

---

## What it does

- **Media server** — browse and stream your local library (photos + video) to any device on the LAN. Full-screen viewer with **video segment auto-play** and a **photo slideshow** (Play/Pause, timed advance, loops the album). Serves the file types you select — a personal, private file-sync surface.
- **On-box brain** — a local **Ollama** model ("Talk to Merlin"), or route to Core's enterprise Leo. Toggle per conversation.
- **Camera sentinel** — IP camera grid (MJPEG / HLS / RTSP→HLS), motion/surveillance, recording.
- **Ingest** — drop media in, Merlin processes it and registers/uploads it to Angel OS (large video goes direct to R2).
- **Node bus** — Merlin's activity streams to its `Node <id>` channel on the Core AI Bus, so the user sees local-node results in their portal.
- **LiveKit** — self-hostable voice/video for Spaces.

Config-free by intent: a fresh Merlin knows where home is (Angel OS) and authenticates the user — permissions flow from Angel OS (anywhere you're admin, your Merlin controls surface).

---

## Navigation

```
CONNECT       Federation · Angel OS Portal
BRIDGE        Home · Dashboard · Activity Log
MEDIA         Media browser + viewer (slideshow, auto-play)
INGEST        Ingest · New Batch
COMMS         LEO (on-box brain / enterprise Leo)
SURVEILLANCE  Cameras · Sentinel · Recording
SYSTEM        Sharing · Resources · YouTube · Keys & Config · Learn
```

---

## Quick Start

```bash
pnpm install
cp .env.example .env.local        # set the Angel OS URL + key
pnpm dev                          # binds 0.0.0.0 → http://<your-lan-ip>:3000
```

Install as a PWA from the browser (Install button / Add to Home Screen) for a standalone app with offline support.

### Running as a service (the box)

Merlin runs as the interactive-session scheduled task **`Merlin`**, which owns port 3000 (never `pnpm start` alongside it — EADDRINUSE). One-shot pull + rebuild + restart:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Dev\merlin\refresh-merlin.ps1
# -NoPull  → rebuild + restart only (skip git pull)
```

### Auto-deploy

Every push to `main` triggers the **Deploy Merlin** GitHub Actions workflow on the self-hosted runner: it pulls → `next build` → restarts the `Merlin` task → verifies `GET /api/health`. Green run = live. If a run goes red, the build/restart log shows why; `refresh-merlin.ps1` is the manual fallback.

---

## Configuration (`.env.local`)

```env
# Angel OS home (Core)
NEXT_PUBLIC_ANGELS_URL=https://www.spacesangels.com
ANGELS_API_KEY=your-api-key

# On-box brain (optional — falls back to Core Leo)
OLLAMA_URL=http://localhost:11434

# LiveKit (optional — also configurable via UI in Keys)
LIVEKIT_SERVER_URL=wss://your-livekit.example.com
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| CMS / data | Payload 3.77 · SQLite (`better-sqlite3`) |
| Brain | `@angel-os/brain` (portable) + local Ollama |
| UI | Tailwind + Lucide |
| Voice/Video | LiveKit |
| Camera | MJPEG/HLS proxy (no browser CORS) |

Collections: ActivityLog · Cameras · Files · Incidents · MessageLog · Submittals · Users.

---

*Part of the Angel OS ecosystem · one of three bodies, one brain · Ad Astra*
