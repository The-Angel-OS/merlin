# Beam Protocol — Principles

**Status:** Principles only · implementation deferred to Sprint 48+
**Date:** 2026-04-18
**Weight:** Sacred. This is not data migration — it is moving a person's digital home between Enterprises.

## Framing

An Endeavor is someone's site. Their memories, their commerce, their community, their Primer, their voice fingerprint, their reading progress. When we beam an Endeavor from one Enterprise to another, we are — for all practical purposes — beaming that person.

The Starfleet transporter ethos fits: the bits disassemble here, reassemble there, and the person who steps off must be indistinguishable from the person who stepped on. No shortcut. No silent migration. No loss.

## Principles

### 1. Consent
The Endeavor's steward (root user) must cryptographically sign every beam. No silent migrations, no admin overrides, no "on your behalf." Signature recorded in a `BeamCeremony` row that persists on both source and destination forever.

### 2. Integrity
The beamed payload is hash-chained. Destination verifies every row against the manifest hash before acknowledging receipt. Mid-beam failure → destination commits nothing, source stays authoritative.

### 3. Identity continuity
The Endeavor keeps its slug, public profile, Entitlements, reading progress, voice fingerprint, and federation standing. A user perceives no discontinuity. The federation directory updates `hostedOn`; Nimue clients transparently reconnect.

### 4. Grief handling
The source Enterprise keeps a read-only shadow of the Endeavor for **30 days** after a successful beam. Two reasons:
- **Rollback** — if the destination experiences catastrophic failure within the window, authority can be restored at the source.
- **Respectful sunset** — nothing is ever yanked. Community members who visit the old address see an acknowledgment page, not a 404.

### 5. Witness
Every beam is announced in the federation directory as a `BeamCeremony` event (source, destination, steward, timestamp, manifest hash). Transparency principle enforced: history is visible, the gears are seen.

### 6. Tenant voice survives
Voice fingerprint + AdaptedContent cache travel with the Endeavor. The Primer's voice does not change when the location changes. (This is why AdaptedContent is tenant-scoped, not global — Sprint 46 decision echoes here.)

### 7. Entitlements honored
Users who purchased access to paywalled Books remain entitled post-beam. Order history preserved. No "one weird trick" to strip entitlements via beam-and-delete.

### 8. Reversible where possible
The 30-day shadow is the primary reversibility window. After that, beams become authoritative. Multi-hop beams (A→B→C) preserve the full chain so origin can always be traced.

## What the protocol must produce

A `BeamPackage` is:

```
{
  endeavor: { slug, tenantRow, voiceFingerprint },
  collections: { [slug]: row[] },           // all tenant-scoped rows
  mediaManifest: [{ id, hash, storageUrl }], // Blob refs, not bytes
  entitlements: [...],
  readingProgress: [...],
  adaptedContent: [...],
  ceremony: {
    steward: { userId, signature },
    sourceEnterprise: 'spacesangels.com',
    destinationEnterprise: 'otherhost.com',
    manifestHash: 'sha256:...',
    createdAt: '...',
  },
}
```

The `BeamPackage` is signed by source Enterprise's private key, encrypted with destination Enterprise's public key. Destination verifies both signatures before accepting.

## Out of scope for v1 (noted, not ruled out)

- Live beaming (zero downtime) — v1 is pause-copy-resume (minutes of unavailability)
- Multi-tenant → multi-tenant rebalancing
- Partial beams (subset of content)
- Cross-federation beams (to non-Angel-OS platforms)

## When

- Sprint 48 earliest — after federation handshake (Sprint 47) is live and proven
- Requires zero-trust peer handshake between Enterprises (Enterprise-to-Enterprise mutual TLS + signed manifests) — a prerequisite sprint of its own
- Probably a multi-sprint arc, not one deliverable

## Record-keeping

This doc lives on both Nimue and Angel OS Core repos under `docs/decisions/`. Any change requires matching updates in both places. The BeamCeremony concept is locked; the protocol is not.

— Kenneth's framing, recorded: *"kind of sacred moment"*
