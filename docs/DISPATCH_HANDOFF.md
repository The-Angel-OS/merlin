# Nimue Desktop — Dispatch Handoff

> Every Dispatch task lands as a fresh prompt. This doc is the cold-start
> primer. Paste the path or the relevant section in any phone-sent task.

---

## This instance's identity

- **Machine:** Windows desktop, wired NAT
- **Claude Code instance:** Nimue client (this one)
- **Primary repo:** `C:\Dev\mediaserver` → `github.com/The-Angel-OS/mediaserver` (branch `master`)
- **Sister instance (IONOS Win 2019):** `C:\Dev\angels-os` → `github.com/The-Angel-OS/angels-os` (mothership / server)
- **Handoff rule:** Nimue = client work. Server asks go *through Kenneth* to the IONOS instance. Don't modify `C:\Dev\angels-os` from here — read-only status checks only.

---

## What's live (Nimue client)

1. **Photo Inventory Queue** — IndexedDB + SHA-256 dedupe, uploader worker, `/inventory` dashboard, `/inventory/new` capture, sidebar Field Ops section.
2. **Federation Connection** — `/connect` directory UI, `/connect/[slug]` Endeavor detail, `ConnectionPill` combadge, Payload JWT auth (mirrors Core), multi-Endeavor session switching.
3. **Adaptive content primitive** — `<Adaptive>` component + `adaptContent()` client (feature-flagged off; waits on Sprint 46 server).
4. **Decision archive** — `docs/decisions/sprint-46-nimue-integration.md`, `sprint-47-federation-handshake.md`, `beam-protocol-principles.md`.

## Waiting on server (mothership)

- **Sprint 46:** Books / Entitlements / ReadingProgress / AdaptedContent collections · Media field extension · Tenants.voiceFingerprint · `/api/content-ops/adapt` · Stripe test round-trip.
- **Sprint 47:** `/.well-known/angel-os` per-Endeavor · `/api/federation/directory` · optional FederationClients collection.
- **Urgent:** helpdna VAPI bridge activation so Ernesto can call in.

## Queued Nimue-side work (priority order)

1. Book reader UI — `/book/[slug]/[chapter]` markdown render + hero image by filename convention.
2. Read-aloud with word-level highlight — Web Speech API `onboundary` event. Primer trajectory.
3. `/content/products/[slug]/checkout` — Stripe test card `4242 4242 4242 4242`.
4. Capacitor native install + `cap add ios/android`.
5. Dashcam organizer (Tauri + ffmpeg) — Sprint 7+.
6. Polish: `baseline-browser-mapping` update, `vite-tsconfig-paths` cleanup, `storage.ts` `@ts-ignore` removal post-Capacitor install.
7. Dependabot moderate vulnerability on `mediaserver`.

---

## Rules (invariants)

- **Endeavor model:** users pick sites, not servers. Enterprise is plumbing.
- **Transparency:** only PII is gated; directory + metadata + public content all unauth. "Gears and levers visible."
- **Beam protocol is sacred** — beaming an Endeavor = beaming the person. Sprint 48+, principles in `docs/decisions/beam-protocol-principles.md`.
- **Pantheon naming:** Nimue (client), Leo (server), Merlin (reserved).
- **Commit style:** detailed body, co-author `Claude Opus 4.7 <noreply@anthropic.com>`, push to `master` when done.
- **CTO mode:** autonomous. Make decisions. Don't ask permission on obvious next steps.
- **Archival-first:** sprint plans → `docs/sprints/`, decisions → `docs/decisions/`. Don't prune for brevity.

---

## Phone-ready Dispatch prompts

### Status check
```
Read C:\Dev\mediaserver\docs\DISPATCH_HANDOFF.md. Run git status + pnpm
test on C:\Dev\mediaserver. Report tests count, build status, uncommitted
changes. Under 150 words.
```

### Keep working (autonomous)
```
Read C:\Dev\mediaserver\docs\DISPATCH_HANDOFF.md. Pick the next queued
Nimue-side task that doesn't wait on server work. Implement, test,
commit, push. CTO mode — no questions, make the call.
```

### Book reader UI
```
Read C:\Dev\mediaserver\docs\DISPATCH_HANDOFF.md. Scaffold book reader
at /book/[slug]/[chapter]: markdown render, matched hero image by
filename convention, progress persistence via appStorage. Feature-flag
NEXT_PUBLIC_BOOKS_ENABLED. Tests + build + commit + push.
```

### Read-aloud
```
Read C:\Dev\mediaserver\docs\DISPATCH_HANDOFF.md. Build Web Speech API
read-aloud with word-level highlight using SpeechSynthesisUtterance
.onboundary. Hook into book reader. Tests + commit + push.
```

### Payments checkout
```
Read C:\Dev\mediaserver\docs\DISPATCH_HANDOFF.md. Build
/content/products/[slug]/checkout — Stripe Elements with test card
4242 4242 4242 4242. POST to /api/stripe-ops/create-intent.
Feature-flag NEXT_PUBLIC_PAYMENTS_ENABLED=false. Tests + commit + push.
```

### Housekeeping pass
```
Read C:\Dev\mediaserver\docs\DISPATCH_HANDOFF.md. Housekeeping pass:
update baseline-browser-mapping, remove vite-tsconfig-paths (native in
Vite 4+), address Dependabot moderate vulnerability if trivial.
Tests + commit + push.
```

### Server coordination (read-only)
```
Read C:\Dev\mediaserver\docs\DISPATCH_HANDOFF.md. Check origin/main on
C:\Dev\angels-os read-only. If server shipped Sprint 46 or 47 commits,
draft a reply to server Claude acknowledging and listing Nimue-side
follow-ups. Do NOT push to angels-os. Just report.
```

### General
```
Read C:\Dev\mediaserver\docs\DISPATCH_HANDOFF.md then: <task>
```

---

## Don't-dos from Dispatch

- Don't modify code in `C:\Dev\angels-os` — server instance's job.
- Don't install Capacitor packages without a heads-up — changes build graph.
- Don't push to `main` on `angels-os` under any circumstances.
- Don't commit `data/payload-cache/` — dev-only scratch.
- Don't `pnpm build` without running tests first.

## Recovery

If state looks stale on return:

```
cd C:\Dev\mediaserver && git status && git log --oneline -5 && pnpm test
```

Then re-read the handoff and proceed from verified ground truth.

---

*Last updated: 2026-04-18. Nimue client. 141/141 tests green. Master up-to-date with origin.*
