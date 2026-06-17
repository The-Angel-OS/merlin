# Sprint 47 — Federation Handshake

**Status:** Server endpoints queued · Nimue client-side shipped
**Date:** 2026-04-18
**Scope:** Nimue client (this repo) + Angel OS Core endpoints (mothership)

## Model (corrected from earlier drafts)

DNN-analogous vocabulary:

| Concept | Angel OS | Example |
|---------|----------|---------|
| Federation | The whole network | All Angel OS nodes |
| Enterprise | A server/deployment | spacesangels.com, self-hosted IONOS node |
| Endeavor | A tenant/portal | clearwater-cruisin, helpdna, hayescactusfarm, tomstalcupforcongress |

Users pick **Endeavors** (sites), not Enterprises (servers). The hosting Enterprise is plumbing the user never needs to see.

## CTO decisions (4)

| # | Question | Decision |
|---|----------|----------|
| 1 | Directory hub location | **`https://www.spacesangels.com/api/federation/directory`** — the canonical Federation root |
| 2 | Auth protocol | **Mirror Angel OS Core auth exactly.** Payload session/JWT, same cookie names, same refresh semantics. No OAuth-lite, no OIDC. Nimue is a remote Payload session holder. |
| 3 | Public Endeavor browsing | **Maximally transparent.** Directory + Endeavor metadata + public content all visible unauth. Only PII is gated. *"Everyone can see the gears and levers."* |
| 4 | Multi-connect | **One active at a time, remember all.** Nimue stores sessions for every Endeavor the user signs into. Switching is local (no network). |

## Transparency invariant (platform-level)

*"Maximum transparency — only PII is hidden. Everyone can see the gears and levers."* Logged here so server + client preserve this rule through future changes.

## Nimue-side ship (shipped 2026-04-18)

- `src/lib/federation.ts` — directory fetch, 6h cache, seed fallback, search, probe
- `src/lib/endeavorAuth.ts` — Payload-session-compatible token store, multi-Endeavor map, login/logout/switch/refresh
- `src/hooks/useConnection.ts` — React hook, state machine, event subscription
- `src/app/connect/page.tsx` — search-first directory UI
- `src/app/connect/[slug]/page.tsx` — Endeavor detail + sign-in
- `src/components/ConnectionPill.tsx` — combadge in header
- Sidebar section + CommandPalette entry + breadcrumb
- 43 tests (19 federation + 24 endeavorAuth), all passing

## Server-side asks (queued for after Sprint 46)

1. **`GET /.well-known/angel-os`** — served from every Endeavor subdomain; returns identity manifest
2. **`GET /api/federation/directory`** — endeavor-first shape aggregating heartbeat + Tenants data
3. **`POST /api/federation/auth-login`** — thin wrapper around Payload `/api/users/login` (or Nimue uses that directly — current implementation does the latter)
4. **`POST /api/federation/auth-refresh`** — thin wrapper around Payload refresh (Nimue uses `/api/users/refresh-token` directly for now)

Optional: `FederationClients` collection for observability (deviceId, userId, endeavorSlug, appVersion, lastSeenAt).

## Seed directory

Nimue ships with a hard-coded seed of the four known Endeavors (clearwater-cruisin, helpdna, hayescactusfarm, tomstalcupforcongress). When network fails on first boot, users can still see the federation. Seed gets refreshed lazily from live directory on every successful fetch.

## Post-ship operations

- Volunteer task: write `/.well-known/angel-os` handler on server (small, scoped, no schema changes)
- Volunteer task: Discord auth live config + one smoke test
- VAPI bridge: identify activation deltas (server Claude reports)
