import fs from 'node:fs'
import path from 'node:path'

/**
 * shares.ts — what THIS Merlin instance offers an endeavor. The single source of
 * truth for the node's advertised capabilities, edited in the /shares control panel
 * and pushed UP via buildNodeCatalog() → /api/node-ops/register.
 *
 * Three things make this the "drop a Merlin on anything" spine:
 *  1. Tiered, opt-in toggles — presence is implicit (hostname/online always beam);
 *     everything else is an explicit grant the owner flips on.
 *  2. Named presets — ship a node preset for a role ("compute-only", "retrieval-only")
 *     so you can drop it for an enterprise with one instruction.
 *  3. Env preconfiguration — MERLIN_SHARES_JSON / MERLIN_PROFILE let you bake the
 *     profile into the image/container before the box ever boots.
 *
 * Precedence (highest first): MERLIN_SHARES_JSON → MERLIN_PROFILE → data/shares.json → 'all'.
 * Intent here is ANDed with availability in node-catalog (media needs shared roots,
 * compute needs Ollama) — a toggle says "willing to share", the catalog says "able to".
 */

const CONFIG_PATH = path.resolve('data/shares.json')

/** Every shareable capability. Grouped into tiers for the UI + the trust model. */
export interface ShareFlags {
  /** detailed telemetry (CPU/mem/uptime series) — presence/heartbeat is always on regardless */
  stats: boolean
  /** local media library (only effective when at least one root is marked shared) */
  media: boolean
  /** camera + sentinel snapshots submitted to the endeavor */
  cameras: boolean
  /** ingest pipeline (inventory upload) */
  ingest: boolean
  /** Merlin Console — let the endeavor talk to this node's local brain over the bus */
  leo: boolean
  /** lend local LLM compute (only effective when Ollama is available) */
  compute: boolean
  /** distributed retrieval ops (indexing / search shards) */
  retrieval: boolean
  /** advertise the reverse tunnel URL as the bulk/streaming path */
  tunnel: boolean
}

export interface SharesConfig {
  /** the named preset last applied, for display ('custom' once hand-edited) */
  profile: string
  shares: ShareFlags
}

/** Tier metadata — drives UI grouping and the guardrail/trust model. */
export const SHARE_TIERS: Array<{
  tier: 0 | 1 | 2
  title: string
  blurb: string
  keys: (keyof ShareFlags)[]
}> = [
  { tier: 0, title: 'Presence', blurb: 'Name, online status, telemetry. Identity only — always safe.', keys: ['stats'] },
  { tier: 1, title: 'Content', blurb: 'Files this node contributes to the endeavor.', keys: ['media', 'cameras', 'ingest'] },
  { tier: 2, title: 'Compute & control', blurb: 'Lend cycles or let the endeavor reach in. Higher trust.', keys: ['leo', 'compute', 'retrieval', 'tunnel'] },
]

export const SHARE_LABELS: Record<keyof ShareFlags, { label: string; help: string }> = {
  stats: { label: 'Telemetry', help: 'CPU, memory, uptime heartbeat' },
  media: { label: 'Media library', help: 'Browse shared drives (needs a shared root)' },
  cameras: { label: 'Cameras / sentinel', help: 'Submit camera + sentinel snapshots' },
  ingest: { label: 'Ingest', help: 'Contribute via the inventory pipeline' },
  leo: { label: 'LEO console', help: "Let the endeavor talk to this node's brain" },
  compute: { label: 'LLM compute', help: 'Lend local Ollama models (needs Ollama)' },
  retrieval: { label: 'Distributed retrieval', help: 'Index / search shard for the endeavor' },
  tunnel: { label: 'Reverse tunnel', help: 'Expose the bulk/streaming path publicly' },
}

const ALL_ON: ShareFlags = {
  stats: true, media: true, cameras: true, ingest: true,
  leo: true, compute: true, retrieval: false, tunnel: false,
}
const PRESENCE_ONLY: ShareFlags = {
  stats: true, media: false, cameras: false, ingest: false,
  leo: false, compute: false, retrieval: false, tunnel: false,
}

/** Named presets — "drop a Merlin preset for a role". */
export const SHARE_PRESETS: Record<string, ShareFlags> = {
  all: { ...ALL_ON },
  private: { ...PRESENCE_ONLY },
  'compute-only': { ...PRESENCE_ONLY, leo: true, compute: true, retrieval: true },
  'retrieval-only': { ...PRESENCE_ONLY, retrieval: true },
  'media-only': { ...PRESENCE_ONLY, media: true, tunnel: true },
}

export const PRESET_BLURBS: Record<string, string> = {
  all: 'Everything this node can offer (default).',
  private: 'Presence only — shares nothing but that it exists.',
  'compute-only': 'Lend LLM compute + distributed retrieval. No files.',
  'retrieval-only': 'Distributed retrieval shard only.',
  'media-only': 'Share media over the tunnel. No compute.',
}

function normalize(raw: Partial<SharesConfig> | undefined): SharesConfig {
  const shares = { ...ALL_ON, ...(raw?.shares || {}) }
  return { profile: raw?.profile || 'all', shares }
}

/**
 * loadShares — env override → named env preset → data/shares.json → 'all'.
 * Read on every call (not cached) so the heartbeat re-register picks up edits.
 */
export function loadShares(): SharesConfig {
  // 1. full JSON override (image/container preconfig)
  const json = process.env.MERLIN_SHARES_JSON
  if (json) {
    try {
      return normalize(JSON.parse(json))
    } catch {
      /* fall through to next source */
    }
  }
  // 2. named preset via env
  const envProfile = process.env.MERLIN_PROFILE
  if (envProfile && SHARE_PRESETS[envProfile]) {
    return { profile: envProfile, shares: { ...SHARE_PRESETS[envProfile] } }
  }
  // 3. persisted file (set via the /shares UI)
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return normalize(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')))
    }
  } catch {
    /* fall through to default */
  }
  // 4. default: share everything the node can (preserves prior behavior)
  return { profile: 'all', shares: { ...ALL_ON } }
}

export function saveShares(cfg: SharesConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalize(cfg), null, 2), 'utf-8')
}

/** True when the active profile is locked by env (the UI should show read-only). */
export function isEnvLocked(): boolean {
  return Boolean(process.env.MERLIN_SHARES_JSON || (process.env.MERLIN_PROFILE && SHARE_PRESETS[process.env.MERLIN_PROFILE]))
}

/**
 * deriveCapabilities — intent (share flags) ANDed with availability. This is the
 * capabilities[] beamed UP to the endeavor; the viewer renders a tab per entry.
 */
export function deriveCapabilities(
  shares: ShareFlags,
  avail: { hasSharedRoots: boolean; ollamaAvailable: boolean },
): string[] {
  const caps: string[] = []
  if (shares.stats) caps.push('stats')
  if (shares.media && avail.hasSharedRoots) caps.push('media')
  if (shares.cameras) caps.push('cameras')
  if (shares.ingest) caps.push('ingest')
  if (shares.leo) caps.push('leo')
  if (shares.compute && avail.ollamaAvailable) caps.push('compute')
  if (shares.retrieval) caps.push('retrieval')
  return caps
}
