# Sprint 46 — Nimue Integration (Schema + adaptContent)

**Status:** Dispatched to mothership · in flight
**Date:** 2026-04-17
**Scope:** Angel OS Core (server-side) · C:\Dev\angels-os

## Decisions locked (CTO)

| # | Question | Decision |
|---|----------|----------|
| 1 | Media field extension vs new endpoint | **Option A** — extend Media collection with 6 fields (tags, notes, lat/lon, capturedAt, sourceCollection, batchId). `location` as `group {lat, lon}`. `sourceCollection` typed as select. |
| 2 | AdaptedContent cache scope | **Tenant-scoped.** Voice fingerprint per tenant is sacred. Global cache deferred until cost pressure forces the question. |
| 3 | Entitlement granularity | **Per-product.** One Entitlement = one unlocked Book. Chapter-level preview via `Books.chapters[].paywalled` boolean, not separate Entitlement rows. |

## Collections added (server)

1. **`Books`** — thin index (slug, title, author, tenant, manifestMedia, chapters[], paywallProduct, status)
2. **`Entitlements`** — user × product × source, auto-created from Orders.afterChange hook
3. **`ReadingProgress`** — user × book × chapter × wordOffset (resume position)
4. **`AdaptedContent`** — content-addressed cache keyed on `sha256(source:audience:invariants:voiceFingerprint)`

## Fields added

- **`Tenants.aiConfig.voiceFingerprint`** group — sampleHash, styleVector, voiceExemplars[]
- **`Media`** — tags[], notes, location{lat,lon}, capturedAt, sourceCollection, batchId (matches what Nimue's uploader sends)

## Utilities added (server)

- **`src/utilities/adaptContent.ts`** — content adapter with tenant voice + invariant validation + cache hit-or-generate
- **`src/utilities/fingerprintVoice.ts`** — one-shot voice fingerprint from tenant exemplars

## Endpoints added (server)

- `POST /api/content-ops/adapt` — adapter API (auth required, tenant-scoped)
- LEO tool `adapt_content` (in CONTENT_MUTATION_TOOLS; revalidates source path)

## Nimue-side pre-work (this repo)

While server builds, Nimue has scaffolded:

- `src/lib/adaptive.ts` — client of `/api/content-ops/adapt`, auth-aware via active Endeavor JWT, degraded fallback on any error
- `src/components/Adaptive.tsx` — React component with provenance badge
- Feature flag `NEXT_PUBLIC_ADAPTIVE_ENABLED` (off until server lands)

## Verification plan

1. Server generates + commits migration
2. Server deploys to IONOS + Vercel
3. Nimue runs `pnpm payload generate:types` against new schema
4. Nimue flips `NEXT_PUBLIC_ADAPTIVE_ENABLED=true`
5. Live test: fetch adapted prose from a tenant with exemplars set
6. Checkpoint: Stripe test mode round-trip for Entitlement auto-create
