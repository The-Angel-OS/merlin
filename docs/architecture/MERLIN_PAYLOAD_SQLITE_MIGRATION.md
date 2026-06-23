# Merlin → Payload CMS + SQLite — migration guide

> 260622 — the plan to give every Merlin node a real local DB spine. Decided by Ken:
> the distributed brain was *always* designed assuming each node has a local DB-based
> message store; the JSON `store.ts` was scaffolding. Payload + SQLite is the spine —
> "Optimus Prime grade hydraulics." This doc guides the next development push.

## 0. Why (the one-paragraph case)

Merlin today persists to hand-rolled JSON files (`src/lib/store.ts`, `media-roots.json`,
`leoChats`, `file-registry.json`, …). That's fine for a media box but it's *why Merlin
and Core aren't truly identical*. Adopting **Payload 3 + the SQLite adapter
(`@payloadcms/db-sqlite`)** gives the node Payload's collections/hooks/access/admin with
a **single embedded file DB** — zero external services, the "just run the installer"
install stays featherweight. The payoff: same data shapes as Core → the bus + console
run on Payload **locally**, the portable MerlinControl + mirror-console come nearly for
free, and local RAG / telemetry history / offline-first become "just another collection."

Storage becomes local + sovereign; **inference stays shared + brokered** (see the
Endeavor inference broker — complementary, not part of this migration).

---

## 1. SQLite wiring

Merlin is already a Next.js 15 app, so Payload integrates exactly as it does in Core
(Payload ships as a set of Next routes + the admin UI).

**Dependencies**
```
pnpm -C C:/Dev/merlin add payload @payloadcms/db-sqlite @payloadcms/next \
  @payloadcms/richtext-lexical sharp graphql
```

**`src/payload.config.ts`** (minimal):
```ts
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { Messages } from './collections/Messages'
import { Channels } from './collections/Channels'
// …other collections / globals

export default buildConfig({
  // SQLite file lives under the node's data dir (same place store.ts writes today).
  db: sqliteAdapter({
    client: { url: `file:${path.join(process.cwd(), 'data', 'merlin.db')}` },
  }),
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'merlin-local-dev-secret',
  collections: [Messages, Channels, /* … */],
  globals: [/* Settings, YouTubeCache, LiveKit … */],
  typescript: { outputFile: path.join(process.cwd(), 'src/payload-types.ts') },
})
```

**Next integration** (mirror Core's layout, scoped so the public Merlin UI is untouched):
- `src/app/(payload)/admin/[[...segments]]/page.tsx` + `not-found.tsx` (admin UI)
- `src/app/(payload)/api/[...slug]/route.ts` (Payload REST/local API)
- `src/app/(payload)/layout.tsx`
- add `@payloadcms/next/withPayload` around `next.config.js` (compose with the existing
  PWA wrapper).

**Env**: `PAYLOAD_SECRET` in `.env.local` (the local-override file already scaffolded).
SQLite needs no `DATABASE_URI`.

**Gotchas**
- `process.cwd()` under the NSSM service = `C:\Dev\merlin` (AppDirectory), so the DB
  lands in `C:\Dev\merlin\data\merlin.db` — same dir as the JSON stores. Good.
- `better-sqlite3` is native; it's already in `serverExternalPackages` (next.config.js).
  Keep it there.
- **Any change that adds Payload to the build is breaking → needs a service rebuild**
  (`rebuild-merlin-service.ps1`, elevated/UAC). Plan the cutover deliberately.
- Migrations: dev can use `push: true` (auto-sync schema); for the shipped node, generate
  migrations so a release doesn't reshape a user's DB unexpectedly.

---

## 2. Collection map (store.ts → Payload)

Today's JSON stores and their Payload homes. **Collections** for lists, **globals** for
singletons. Keep the field shapes that already work; mirror Core's `Messages` shape exactly.

| Today (JSON) | Payload | Notes |
|---|---|---|
| `leoChats` conversations + the **bus channel** | **`messages`** (collection) | THE keystone. Mirror Core `Messages`: `content` (JSON, `{text}`), `channel` (slug text), `messageType`, `author`, `metadata` (kind/requestId/tool/args), `createdAt`, `federationId`. Local LEO chat, bus commands, and results all live here. |
| (implicit channels) | **`channels`** (collection) | Mirror Core: `slug`, `name`, `type`, `space?`. The node-console + node-bus channels locally. |
| `media-roots.json` (`roots[]`) | **`media-roots`** (collection) | One row per root: `path`, `label`, `icon`, `enabled`, `shared`. Replaces the array; `getSharedRoots()`/`isPathShared()` query `shared:true`. |
| `file-registry.json` (`FileRecord[]`) | **`files`** (collection) | `path`, `name`, `ext`, `category`, `size`, `detectedAt`, `status`, `youtubeId?`, `notes?`. |
| `cameras.json` (`Camera[]`) | **`cameras`** (collection) | The Camera type verbatim (+ future local-device cameras). |
| `incidents.json` (`Incident[]`) | **`incidents`** (collection) | verbatim. |
| `activity-log.json` (`LogEntry[]`) | **`activity-log`** (collection) | Capped/rotated; or fold into Payload's own logging. Index on `type`,`timestamp`. |
| `settings.json` (incl. the **node-bus binding**) | **`settings`** (global, typed) | `youtube*`, `angels*`, `*ApiKey`, `watchedDirs`, paths, `port`, `tvMode`, `tunnelUrl`, AND `boundEndeavor`/`nodeToken`/`busChannel`/`busSpaceId`/`busCursor`. A typed global = the singleton it already is. |
| `youtube-cache.json` | **`youtube-cache`** (global) | `channel`, `videos[]`, `updatedAt`. |
| `livekit.json` | **`livekit`** (global) | `serverUrl`,`apiKey`,`apiSecret`. |
| endeavor sessions (client localStorage) | **`endeavor-sessions`** (collection) OR keep client-side | Server-side is better for the multi-session mirror console; but JWTs in SQLite need the same care as `.env.local`. Decide during the port. |

Start with **`messages` + `channels` + `settings`** (the bus/console spine + the binding);
migrate the rest opportunistically.

---

## 3. The store.ts → Payload port plan (incremental, non-breaking)

Do **not** rip out `store.ts` in one commit. Introduce a thin data-access layer and flip
it over collection-by-collection behind a flag.

1. **Stand up Payload alongside the JSON store** (Section 1). No behavior change yet —
   the DB exists, admin works, nothing reads it.
2. **Introduce a repo layer** — e.g. `src/lib/db/*.ts` with the same function signatures
   `store.ts` exports today (`getSettings`, `appendLog`, `getFiles`, `loadRoots`, …).
   Each function gets two impls: `*Json` (current) and `*Payload`. A flag
   (`MERLIN_DB=payload|json`, default `json`) selects.
3. **Port the keystone first: `messages`/`channels`.** Rewrite `node-bus.ts`'s
   `readNodeStream`/`pollOnce`/result-posting and `leoChats` to use Payload's local API
   (`payload.find/create`). Now the console + bus + local LEO history are Payload-backed.
4. **One-time JSON→SQLite import** on first boot in `payload` mode: read each JSON file,
   `payload.create` the rows, rename the JSON to `.imported`. Idempotent (skip if the
   collection is already populated). Keep the JSON as a backup.
5. **Port the rest** (media-roots, files, cameras, incidents, settings, caches) the same
   way, one PR each, verifying on the preview server (`pnpm dev` on a spare port — no
   service rebuild needed to verify) before the cutover rebuild.
6. **Flip the default to `payload`**, delete the `*Json` impls once stable, drop `store.ts`.

Each step is shippable and reversible (flip the flag back to `json`).

---

## 4. How local Messages federate with Core

Same `Messages` shape on both ends makes this an upsert, not a protocol.

- **Identity**: every message carries a stable `federationId` (e.g. `core:<id>` or
  `merlin:<nodeId>:<localId>`). Sync = upsert-by-`federationId`; idempotent both ways.
- **The bus channel is the federation seam.** Today Merlin pulls commands from Core's bus
  channel via its node token and posts results back (`node-bus.ts`). After the migration,
  the same loop **mirrors those messages into the local `messages` collection** (pull →
  local upsert → process with the local brain → post result to Core → local upsert). The
  console/UI then reads **locally** (instant, offline-capable), and Core stays the
  authority for the shared channel.
- **Direction of truth**: shared bus channels = Core-authoritative (Merlin caches +
  contributes). Node-local content (local LEO chats, file registry, telemetry history) =
  Merlin-authoritative (optionally echoed up). No conflict resolution needed if each row
  has a single owner; `federationId` + `updatedAt` handle the rest.
- **Offline-first falls out for free**: the loop is already outbound-poll; when Core is
  unreachable, Merlin keeps writing locally and reconciles on reconnect.

This is exactly the "different compatibility layer" Ken flagged — and with identical
shapes it's a few-line upsert, not a translation layer.

---

## 5. Sequencing & risk

**Phases** (each its own session/PR; rebuild the service only at a cutover):
1. Payload + SQLite stood up, admin reachable, zero reads (non-breaking; rebuild once).
2. Repo layer + `messages`/`channels` ported behind `MERLIN_DB` flag; verify on preview.
3. JSON→SQLite import on first boot; flip the keystone to `payload`.
4. Port remaining stores; flip default; remove `store.ts`.

**Risks / watch-items**
- **Service rebuilds need Ken's UAC** — batch breaking changes; verify on the preview
  server (`pnpm dev`, spare port) before each rebuild.
- **SQLite file location** must follow `process.cwd()` (the service's AppDirectory).
- **Native `better-sqlite3`** stays in `serverExternalPackages`.
- **Don't migrate secrets carelessly** — JWTs/keys in SQLite deserve the same caution as
  `.env.local`; prefer keeping live secrets in env, not the DB.
- **Composes with, but is independent of, the Endeavor inference broker** — ship them
  separately; storage-local + inference-brokered is the end state.

---

## 6. First task for the next push
Phase 1 + the `messages`/`channels` port (Phase 2) — that alone makes the Merlin Console
and node-bus Payload-backed locally, the highest-leverage slice. Everything else is
opportunistic from there.
