# The Event Loop — "every action is processed"

Status: **design + slice-1 spec** · Home of the portable brain (`leoBrain`), so this
lives in Merlin and drops into Nimue and Core unchanged. First body to ship it: **Nimue**.

---

## 1. Principle

Today only a **chat message** drives the brain's loop. Generalize that: **every UI
action becomes an event on one local log**, processed by the same pipeline.

> Events always log. Reflexes handle the common case locally and instantly.
> The model (cortex) is **one optional subscriber — never the default handler.**

This is the cerebellum/cortex split: a reflex layer + local store answer 95% of events
with no network; the brain wakes only for reasoning, explicit chat, or when it *chooses*
to watch the stream. Repeated `event → action` patterns compile down to reflexes so the
loop stops waking the cortex for things it has seen enough times.

## 2. The event

```ts
interface AppEvent {
  id: string        // monotonic, sortable (e.g. `${ts}-${seq}`) — ordering + dedupe
  ts: number        // client clock at creation
  type: string      // "photo.posted" | "enterprise.locked" | "channel.opened" | "chat.sent" …
  actor: string     // userId | "leo" | "system"
  source: string    // "nimue" | "merlin" | "core" — which body emitted it
  payload: unknown  // type-specific
  status?: 'local' | 'syncing' | 'synced' | 'failed'  // for offline-first reconcile
}
```

## 3. One log, three roles (do NOT build three stores)

The single append-only log is simultaneously:
- **UI state** — reduce the log → current screen state
- **Audit / contribution ledger** — the proof-of-work trail (feeds token economy)
- **Perception stream** — what the cortex can watch / replay

## 4. dispatch() — the pipeline

```
dispatch(event):
  1. persist(event)            # durable BEFORE side effects (offline-first; the log is the outbox)
  2. for reflex of reflexes[event.type]: reflex(event, store)   # cerebellum — sync, no network
  3. if subscribed(event.type): notify brain   # cortex — opt-in only, async, rate-limited
```

The order matters: persistence first means a killed app / lost signal never drops an
action — it replays from the log on next boot.

## 5. Storage layering (where Capacitor pays off)

Same interface, growing backend — portability is a contract, not premature plumbing:

| Phase | Web | Device | Why |
|---|---|---|---|
| **now (slice 1)** | `localStorage` via `storage.ts` | Capacitor `Preferences` via `storage.ts` | zero new deps; cap to last N events (ring) |
| later | IndexedDB | Capacitor SQLite (op-sqlite) | when volume outgrows a capped ring |

`storage.ts` already abstracts Preferences-on-device vs localStorage-on-web. Slice 1
reuses it as-is; the log is a capped ring so we never blow the key-value budget. Swapping
to IndexedDB/SQLite later is behind the same `appendEvent`/`readEvents` interface.

## 6. Portability

`AppEvent` joins the **neutral message format** as part of the interop contract. Same
event shape across Nimue / Merlin / Core → the same loop, reflex registry, and brain
subscriber drop into any body. Only the reflex set and tool belt differ per embodiment.

## 7. Sharp edges (respect these)

- **Ordering & idempotency** — monotonic `id` + dedupe on replay, or offline sync
  double-applies.
- **Don't wake the cortex by default** — reflex-first, or cost/latency/rate-limit explode.
- **One store, not three** — UI state, audit, perception are views of the same log.
- **Privacy** — a complete action log is sensitive. **Local-only by default**; sync is
  opt-in / consented (treat as a constitutional stance, not a toggle).

---

## 8. Slice 1 — the spine (build-ready)

**Goal:** a durable event spine that processes one real action end-to-end, with the model
and budget untouched. Lands in **Nimue** first.

**First citizen: `photo.posted`** — the proven field flow (instant multi-photo capture +
out-of-band Google Photos). It exercises offline-first (the log as outbox) better than any
other action.

### Files
```
src/lib/events.ts        # AppEvent type, appendEvent, readEvents, dispatch, reflex registry
src/lib/reflexes.ts      # type → handler map (cerebellum). Starts with ONE handler.
```
- Persistence reuses existing `storage.ts` (no new dep). Key `nimue.eventlog`, capped ring
  (e.g. last 500), newest-last.

### API
```ts
function appendEvent(e: Omit<AppEvent,'id'|'ts'|'status'>): AppEvent   // stamps id/ts/status='local', persists
function readEvents(limit?: number): AppEvent[]
function dispatch(e: Omit<AppEvent,'id'|'ts'|'status'>): AppEvent      // append → run reflexes → (no cortex yet)
function registerReflex(type: string, fn: (e: AppEvent) => void): void
```

### Wiring
- The multi-photo post path calls `dispatch({ type:'photo.posted', actor:userId, source:'nimue', payload:{ channelId, count, localUris } })`
  **before** the network upload. UI applies optimistically; the upload updates
  `status: 'syncing' → 'synced' | 'failed'`.
- One reflex registered: `photo.posted` → write an Activity-Log line (the perception view).

### Surface
- Render the log in Nimue's existing **Activity Log** view (newest first) — this is the
  perception stream made visible. No new screen.

### Acceptance criteria
- Posting N photos appends exactly one durable `photo.posted` event (survives app restart).
- The reflex runs synchronously with no network call.
- Killing the app mid-upload and reopening replays the event with `status:'syncing'|'failed'`
  (no lost post).
- The model is never invoked. Gemini budget unchanged.

### Explicitly OUT of scope for slice 1
- Cortex subscriber / proactive Leo (next slice)
- Reflex compilation (pattern → reflex)
- IndexedDB / SQLite backend (until volume demands)
- Cross-body sync of the log (local-only by default)

---

## 9. Roadmap after slice 1
1. **Cortex subscriber** — opt-in brain watch on selected event types (proactive Leo).
2. **Reflex compilation** — repeated `event→action` becomes a local reflex.
3. **Durable backend** — IndexedDB (web) / Capacitor SQLite (device) behind the same API.
4. **Consented sync** — push the log up as audit/contribution ledger (token economy).
