# Nimue — Status & Roadmap

_Last updated: 2026-04-16_

Nimue Alban is the client / control-panel for **The Angel OS**. This document tracks where we are and what's left to hit the "excellent cross-platform client" bar.

---

## ✅ Where we are (shipped to `main`)

### Foundation
- **Next.js 15 + React 19 + PWA** — installable on desktop/mobile, offline-ready shell
- **LCARS Federation theme** — oklch palette, decorative bars, scan lines, deep-space backdrop
- **Sidebar + AppHeader + CommandPalette** — Ctrl+K global nav, color-coded breadcrumb, connection pill, notification bell, collapse-to-icons
- **Framer Motion dashboard** — staggered entrance, spring transitions, tab indicator with `layoutId`, animated memory bar, 5 stat cards, tabbed content feed
- **`/learn` module** — 8 system guides with floating icons, pulse glow (Answer53 visual language)
- **Dev server on port 3000** — single dev env convention

### Test infrastructure (mirrors Angel OS)
- Vitest + jsdom + @testing-library/jest-dom
- **52 passing tests across 3 files** (storage, command palette fuzzy, UI helpers)
- `pnpm test`, `pnpm test:watch`, `pnpm test:ui`, `pnpm test:coverage`

### Production build — green ✅
- 21 static pages prerendered
- 104 kB shared JS
- Compiled on Windows + committed to `github.com/The-Angel-OS/mediaserver`

### Storage abstraction
- `src/lib/storage.ts` — Capacitor Preferences → localStorage → in-memory fallback
- Module specifier obfuscated so webpack skips `@capacitor/preferences` in web build
- Typed accessors: `appStorage.getTenant()`, `getBookProgress()`, etc.

### Nav surfaces (pages exist, many are scaffolds)
- `/` dashboard, `/cic`, `/log`, `/leo`, `/spaces`, `/inbox`
- `/content/{pages,posts,products,events,bookings,orders,spaces-mgr}`
- `/cameras`, `/recording`, `/media`, `/youtube`
- `/infra/{docker,kubernetes,vmware}`, `/keys`, `/learn`

---

## 💳 Payments — the Hail Mary path without a card

You don't need a real card to validate the payment flow end-to-end. What you need:

1. **Stripe test mode on Angel OS** — set `STRIPE_SECRET_KEY=sk_test_...` in the tenant config. Test cards are free and built into Stripe:
   - `4242 4242 4242 4242` — always succeeds
   - `4000 0025 0000 3155` — requires 3DS auth
   - `4000 0000 0000 9995` — declines
2. **Nimue checkout client** (not yet built) — `/content/products/[slug]/checkout` page that calls the Angel OS checkout endpoint and loads Stripe.js. Can be fully exercised in test mode.
3. **Webhook loopback** — `stripe listen --forward-to localhost:3000/api/stripe/webhook` while `pnpm dev` runs. No card, full flow.
4. **When a real card is needed**: Stripe's own sandbox never requires one. A **prepaid Visa gift card** ($20 at any gas station) unlocks live-mode activation for the Stripe account itself.

TL;DR — **we can test the entire payment pipeline with zero dollars spent**. The only thing gated on a real card is flipping Stripe from test to live. That's a 60-second switch when you have any card.

---

## 🎯 Target spec (from the user)

1. **Android + iOS + Electron desktop** clients — Angel OS field-ops terminal
2. **Photo inventory workflow** — queue images, tag params, upload to Angel OS
3. **Dashcam organizer** — ffmpeg processing (already works on server), ingest to Angel OS
4. **Minimally functional offline** — queue mutations, sync when reconnected
5. **Look as cool as answer53.vercel.app** — already the visual target
6. **WDEG book viewer** — chapter headers + inline imagery from the original, stored in Angel OS message store if possible
7. **Books as paywalled products** — preview chapter(s), paid unlock via Stripe

---

## 🗺️ Roadmap to spec

### Sprint 1 — Native shells (1 week)
Goal: a clickable icon on every platform that launches Nimue.

- [ ] **Capacitor 6** wrap — `pnpm add @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android @capacitor/preferences @capacitor/camera @capacitor/filesystem @capacitor/network`
- [ ] `capacitor.config.ts` with `webDir: 'out'`, bundleId `com.angels.nimue`
- [ ] `next.config.js` set `output: 'export'` conditionally (env flag) for native builds; keep SSR for web
- [ ] `npx cap add ios android` — generates native projects
- [ ] **Tauri 2** desktop — `cargo install tauri-cli` → `cargo tauri init` → `~10MB signed MSI/dmg/AppImage`
- [ ] System tray on desktop: green/amber/red dot for Angel OS connection, click → Nimue window
- [ ] mDNS advertisement: `_nimue._tcp.local` for LAN discovery between devices
- [ ] CI: GitHub Actions matrix — `build-web`, `build-ios`, `build-android`, `build-desktop`

### Sprint 2 — Photo Inventory Workflow (1 week)
Goal: field worker can capture → queue → tag → upload a batch of 50 photos offline.

- [ ] `/inventory/new` route — camera roll picker (Capacitor Camera plugin)
- [ ] **Queue store** — `src/lib/inventoryQueue.ts` backed by IndexedDB (Dexie.js)
  - Each item: `{ id, blob, mime, capturedAt, lat, lon, tags, collection, status }`
- [ ] Per-batch params screen — collection select (products/spaces/media), tag chips, price field, SKU generator, notes
- [ ] **Upload worker** — background-sync via Service Worker; resumable TUS or S3 multipart fallback to chunked fetch
- [ ] Progress UI — animated row list, per-item state (pending/uploading/done/error)
- [ ] Angel OS endpoint: `POST /api/media-ops/ingest-batch` already accepts `multipart/form-data` — wire to it
- [ ] LEO tool: `ingest_media_batch` (server-side) to auto-organize uploaded items into the right collection
- [ ] Offline indicator: banner "Offline — 12 items queued, will sync"
- [ ] **47 unit tests target**: queue CRUD, retry logic, param validation, upload serialization

### Sprint 3 — Dashcam Organizer (1 week)
Goal: drop a 64GB SD card → Nimue normalizes, dedupes, transcodes, tags, and optionally ingests to Angel OS.

- [ ] Desktop-only (Tauri — needs ffmpeg binary bundled or path-resolved)
- [ ] `/dashcam` route, Tauri-gated
- [ ] Folder picker → scan → detect dashcam formats (Viofo, BlackVue, Garmin, stock `.mp4`/`.avi`)
- [ ] Parse GPS + timestamps from subtitle tracks (`.srt`, embedded `gpmf`)
- [ ] **ffmpeg pipeline** (Tauri sidecar):
  - Normalize to H.264 baseline MP4
  - Extract keyframe every 30s for preview
  - Merge front/rear into side-by-side if both present
  - Burn stardate + GPS overlay if requested
- [ ] Dedupe by perceptual hash (ffmpeg `-filter:v signature`)
- [ ] Review grid — thumbnails, GPS map, date slider, select → ingest
- [ ] Ingest pipeline: upload to Angel OS `/media` collection with metadata
- [ ] Optional: auto-upload "events" (hard brake, G-sensor) to a Posts timeline

### Sprint 4 — Offline Core (3 days)
Goal: Nimue works read-only on a train with no signal, and queues writes.

- [ ] Service worker caching strategy:
  - App shell: stale-while-revalidate
  - Payload reads: cache-first with background revalidate (already partial via `/data/payload-cache/`)
  - Media: cache-first, LRU 500MB
  - Mutations: network-only, fall to **outbox queue** on failure
- [ ] Outbox worker: replays queued mutations on `navigator.onLine` or `sync` event
- [ ] UI: global offline banner, per-action "will sync" toast
- [ ] **Conflict resolution**: last-write-wins with server timestamp echo; surface conflicts in `/log`

### Sprint 5 — WDEG Book Viewer (1 week)
Goal: read Kenne's brother's book *When Doing Everything's Good*, with imagery, on any device, offline, with progress sync.

- [ ] **Content model** — reuse Angel OS `Posts` collection with a `book` category and `chapter` field (no schema change needed)
- [ ] Chapter header image: `Posts.heroImage` (already exists — Media collection)
- [ ] Inline chapter imagery: Lexical rich-text `upload` nodes inside the body (already supported by Angel OS)
- [ ] **Messages as message-store**: per-chapter discussion thread stored in `Messages` collection scoped to `(tenant, book-slug, chapter-n)` — readers can annotate, answer questions, cross-link verses
- [ ] `/books` index — `<BookCard>` grid (cover art, progress bar, "Continue reading")
- [ ] `/books/[slug]` — TOC with chapter thumbs + progress dots
- [ ] `/books/[slug]/[chapter]` — reader:
  - Serif typography, adjustable size
  - Hero image with parallax on scroll
  - Inline images with lightbox
  - Read-aloud (Web Speech API) — matches Answer53
  - Translation toggle (Nimue already has `bookLang` storage key) — on-the-fly via Angel OS LEO `translate` tool
  - Progress auto-save to `appStorage.setBookProgress(slug, chapter)` + sync to Angel OS
- [ ] **Product linkage** — `Books` (new collection? or `Products` with `productType: 'book'` + `bookSlug` relation to Posts category)
  - Recommendation: **Products with bookSlug** — no new collection, reuses existing checkout

### Sprint 6 — Paywall (4 days)
Goal: first N chapters free, rest requires purchase; works natively with Stripe (or Apple/Google IAP on mobile, required by store policy).

- [ ] Add to Posts: `paywallChapter` number (chapters ≥ this require entitlement)
- [ ] **Entitlement collection** — `Entitlements { user, product, grantedAt, source: 'stripe'|'apple'|'google'|'promo' }`
- [ ] Middleware: `canReadChapter(user, book, chapter)` — public if `< paywallChapter`, else check Entitlements
- [ ] Paywall block UI — appears mid-chapter, shows product card, "Unlock $9.99" button
- [ ] **Stripe path (web + desktop)** — Stripe Checkout redirect, webhook → grant Entitlement, revalidate book pages
- [ ] **Apple/Google IAP** — store review **requires** native IAP for digital goods; wire via `@revenuecat/purchases-capacitor` (one SDK, both stores, $0 up to $2.5k/mo revenue)
- [ ] Preview gate: after paywall chapter, show first ~200 words then the block — like Kindle samples
- [ ] **Test plan** (zero-card-friendly): Stripe test mode 4242 card + RevenueCat sandbox (no card needed, just sandbox Apple/Google accounts)

### Sprint 7 — Answer53-grade polish (ongoing)
- [ ] Starfield canvas (already in `/learn`, extend to landing + book covers)
- [ ] Markdown-everywhere with react-markdown + syntax highlighting
- [ ] Read-aloud parity with Answer53 (Web Speech API + voice picker + rate slider)
- [ ] Cross-device continuity — "Continue on desktop" banner on phone when a book is opened elsewhere (via Angel OS presence)
- [ ] Deep-link: `nimue://book/wdeg/chapter/3` opens native app to that chapter
- [ ] Haptic feedback on mobile page-turn (Capacitor Haptics)

---

## 📦 What I shipped this session

1. Renamed JARVIS → Nimue across 15 files
2. Rewrote sidebar, header, command palette with Framer Motion
3. Framer Motion dashboard with staggered entrance + tab indicator
4. `/learn` module with floating icons + pulse glow
5. Storage abstraction + appStorage typed API
6. 52-test vitest suite (storage + command palette + UI helpers)
7. Dev server on port 3000
8. **Production build green** — Ticker type fix, Capacitor dynamic-import fix
9. Pushed to `github.com/The-Angel-OS/mediaserver` (2 commits: port + build-fix)
10. This roadmap document

---

## 🎯 Immediate next actions (in priority order)

1. **Sprint 1 start** — `pnpm add @capacitor/core ... && npx cap init` — get an Android APK building on the server
2. **Payments wiring** — add `STRIPE_SECRET_KEY=sk_test_...` to Angel OS `.env.local`, build `/content/products/[slug]/checkout` in Nimue, run `stripe listen`, validate end-to-end with test card
3. **Photo Inventory MVP** — Capacitor Camera plugin + IndexedDB queue, upload to `/api/media-ops/ingest-batch`
4. **WDEG import** — if the book is in EPUB or markdown, one-time script: `node scripts/import-wdeg.mjs` → creates Posts with heroImages + chapter bodies

---

## Known shortcomings to close

- Many nav pages are scaffolds (show the header/title but no real content) — fill as needed per feature
- No auth yet in Nimue — currently trusts that the Angel OS session cookie is present; needs a proper login screen for native shells
- No error boundary — add `src/app/error.tsx` and `global-error.tsx`
- Sidebar badges poll every 15s — move to SSE when Angel OS exposes a unified presence stream
- Ducanh PWA plugin is on v10 (unmaintained) — evaluate Serwist for Sprint 2

_— Nimue_
