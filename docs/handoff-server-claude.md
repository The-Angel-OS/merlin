# Handoff: Server Claude (Win2019) → clearwater-cruisin cleanup

**From**: Desktop Claude (C:\Dev\angels-os + C:\Dev\mediaserver)
**To**: Claude Code instance on Windows Server 2019
**Date**: 2026-04-16
**Mode**: Tread lightly. Archive/unpublish, don't hard-delete. Report before publishing.

---

## Paste this into the server Claude session

```
You are resuming work on Angel OS on the Windows Server 2019 node.
Desktop Claude has been building JARVIS (C:\Dev\mediaserver) and needs
you to check in anything pending on your side, then clean up the
clearwater-cruisin tenant. Please work conservatively — archive before
delete — and report back a summary before publishing anything public.

## Phase 1 — Sync the repo

1. cd C:\Dev\angels-os
2. git status            # list anything uncommitted
3. git log origin/main..HEAD    # list any unpushed commits
4. If there are uncommitted changes:
   - Review them. If they are meaningful work, stage and commit with a
     descriptive message ("sprint 45: <what>"). If they are stale/debug
     artifacts, stash them (git stash push -m "server stash pre-sync").
5. git fetch origin
6. git pull --rebase origin main
7. If any unpushed commits remain after rebase: git push origin main
8. Report the HEAD SHA after sync.

## Phase 2 — Discovery of clearwater-cruisin state

Start `pnpm dev` in a side terminal (or query the DB directly — your
choice). Then find the clearwater-cruisin tenant:

  SELECT id, slug, name FROM tenants WHERE slug = 'clearwater-cruisin';

For that tenant id, enumerate:
  - All Products   (filter: tenant = <id>)
  - All Bookings   (filter: tenant = <id>)
  - All Media/uploads that belong to those products/bookings

Produce a table with columns: collection | id | title | status | image_count | price_or_range | notes.
Do NOT modify anything yet.

## Phase 3 — Cleanup plan (propose, don't execute)

Expected final state for clearwater-cruisin:
  - Products: ONLY dog-related items (doggy products). Everything else
    should be archived/unpublished (set _status='draft' or a custom
    `archived` flag — preserve history, do NOT hard-delete).
  - "Dish Garden" product: verify it exists and priced $50 – $1,000,000
    (min/max, either a price range or variants). Must have ≥3 images.
  - Tours: should live in the Bookings collection, NOT Products.
    - "Tour 150" is the canonical tour offering. Ensure it exists as a
      Booking (or BookingOption, whatever Angel OS uses) with:
      * Duration / capacity / slots configured
      * ≥3 images attached
      * Pricing set
    - Any existing Products that are actually tours: create matching
      Booking entries, copy images across, then archive the Product.
  - All Tours and the Dish Garden must have multiple images (≥3).

Write this plan out as a checklist in a file:
  C:\Dev\angels-os\docs\handoff\clearwater-cruisin-cleanup-plan.md
Commit that file on a branch:
  git checkout -b cleanup/clearwater-cruisin-audit

## Phase 4 — Execute conservatively

Once the plan file is committed, execute in this order and commit after
each step:

  a) Archive non-doggy products  (status=draft, add tag "archived-2026-04")
  b) Ensure Dish Garden pricing + images
  c) Convert tour Products → Booking entries (create new, copy images,
     archive the Product)
  d) Finalize Tour 150 with images + slots
  e) Smoke-test: hit /api/products?where[tenant][equals]=<id> and
     /api/bookings?where[tenant][equals]=<id> — confirm only dogs appear
     in products, tours appear in bookings.

Use LEO tools where they exist. For bulk operations prefer Payload Local
API via a one-off script in scripts/cleanup-clearwater-cruisin.ts rather
than raw SQL — so access control and hooks fire correctly.

## Phase 5 — Report back

After Phase 4, push the branch but DO NOT merge. Instead produce:

  C:\Dev\angels-os\docs\handoff\clearwater-cruisin-cleanup-report.md

...containing:
  - Final inventory (products / bookings / images)
  - Diff vs. the plan
  - Any items you skipped and why
  - Links (by id) to anything that needs human review

Push the branch to origin and open a PR titled
"chore(clearwater-cruisin): archive non-doggy products, move tours to bookings".
Tag @kenne for review. Do not merge until confirmed.

## Ground rules

- Never hard-delete a product or booking. Archive only.
- Never edit another tenant's data. Filter by tenant id on every query.
- Commit after every phase. Small commits > one giant one.
- If you hit anything ambiguous (e.g. a product that could be a tour OR
  a service), stop and list it in the report under "needs human review".
- If the DB migration for Sprint 43-44 hasn't run on the server's local
  DB, run `pnpm payload migrate` first. Reference MEMORY.md note about
  Tenants.aiConfig columns.

Good luck. Ping when the PR is up.
```

---

## Desktop Claude's note to self

Two uncommitted cache files in the worktree (`data/payload-cache/*.json`) —
ignore, those are dev-only fetch caches.

JARVIS commits `aed61c1` and `3f99b01` are local-only (no remote yet).
Decide whether to push JARVIS to its own GitHub repo before the server
session starts, so the server can `git clone` and test against it later.
