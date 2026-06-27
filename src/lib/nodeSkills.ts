/**
 * nodeSkills — federation-invocable capabilities this Merlin exposes to a peer
 * (LEO, on behalf of an endeavor). EVERY skill here is clamped to the node's
 * SHARED roots (getSharedRoots) — the scoped-grant boundary — and returns
 * root-RELATIVE paths so a peer never learns the node's real filesystem layout.
 *
 * Auth (the caller proving it may invoke at all) lives in the route; this layer
 * is the capability boundary (what an authenticated caller is allowed to reach).
 * Two rails, defense in depth.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getSharedRoots, isPathShared, type MediaRootConfig } from '@/lib/media-roots'
import { getSettings } from '@/lib/store'

const MEDIA_RE = /\.(mp4|mkv|mov|webm|avi|m4a|mp3|wav|flac|jpg|jpeg|png|gif|webp|pdf)$/i
const MAX_FILES = 200
const MAX_DEPTH = 5

export interface SharedFile {
  /** Root-relative path, e.g. "Movies/Title (2020).mkv" — NO system path. */
  path: string
  name: string
  sizeMB: number
  mtime: string
  root: string // the shared root's label, for grouping
}

export interface ListMediaArgs {
  /** Case-insensitive substring filter on the file name. Omit = all. */
  query?: string
  /** Optional sub-directory to scope to — MUST be inside a shared root or it's rejected. */
  dir?: string
}

/** Bounded recursive walk of one shared root, collecting matching files. */
function walkRoot(root: MediaRootConfig, query: string, out: SharedFile[]): void {
  const q = query.trim().toLowerCase()
  const base = path.resolve(root.path)
  const stack: Array<{ dir: string; depth: number }> = [{ dir: base, depth: 0 }]
  while (stack.length && out.length < MAX_FILES) {
    const { dir, depth } = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) break
      if (e.name.startsWith('.') || e.name.startsWith('$')) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH) stack.push({ dir: full, depth: depth + 1 })
        continue
      }
      if (!MEDIA_RE.test(e.name)) continue
      if (q && !e.name.toLowerCase().includes(q)) continue
      let st: fs.Stats
      try {
        st = fs.statSync(full)
      } catch {
        continue
      }
      out.push({
        path: path.relative(base, full).replace(/\\/g, '/'),
        name: e.name,
        sizeMB: +(st.size / 1_048_576).toFixed(1),
        mtime: st.mtime.toISOString(),
        root: root.label,
      })
    }
  }
}

/**
 * list_media skill — list media files across the node's SHARED roots (newest
 * first), optionally filtered by a name substring. A `dir` arg is honored only
 * if it resolves inside a shared root; anything else is rejected (never leaks
 * outside the grant).
 */
export function listSharedMedia(args: ListMediaArgs): {
  ok: boolean
  error?: string
  count: number
  files: SharedFile[]
  roots: string[]
} {
  const shared = getSharedRoots()
  const roots = shared.map(r => r.label)
  if (!shared.length) {
    return { ok: false, error: 'no shared roots — owner must mark a drive shared', count: 0, files: [], roots: [] }
  }

  const out: SharedFile[] = []
  const query = args.query || ''

  if (args.dir) {
    if (!isPathShared(args.dir)) {
      return { ok: false, error: 'dir is outside the shared roots', count: 0, files: [], roots }
    }
    // Find the owning shared root so relative paths + label stay correct.
    const owning = shared.find(r => isPathShared(args.dir!) && path.resolve(args.dir!).toLowerCase().startsWith(path.resolve(r.path).toLowerCase()))
    const scoped: MediaRootConfig = owning ? { ...owning, path: args.dir } : { path: args.dir, label: 'shared', icon: '', enabled: true, shared: true }
    walkRoot(scoped, query, out)
  } else {
    for (const root of shared) {
      if (out.length >= MAX_FILES) break
      walkRoot(root, query, out)
    }
  }

  out.sort((a, b) => b.mtime.localeCompare(a.mtime))
  return { ok: true, count: out.length, files: out, roots }
}

// ─── Structured file listing for the Merlin Control directory browser ─────────

/** A shared file enriched with a resolvable href (tunnel-first; node-relative fallback). */
export interface BrowsableFile extends SharedFile {
  /** Stable id (root-label + relpath) the file proxy/serve route understands. */
  ref: string
  /** Direct tunnel URL when the node advertises one; else undefined → Core proxies. */
  tunnelUrl?: string
}

/**
 * Encode a {root,path} pair into an opaque-ish ref the file-serve route decodes.
 * Format: "<rootLabel>::<relpath>" (relpath uses forward slashes). Never carries
 * an absolute system path, so a peer can't learn the node's disk layout.
 */
export function fileRef(rootLabel: string, relPath: string): string {
  return `${rootLabel}::${relPath.replace(/\\/g, '/')}`
}

/** Decode a ref back to {rootLabel, relPath}; null if malformed. */
export function parseFileRef(ref: string): { rootLabel: string; relPath: string } | null {
  const i = ref.indexOf('::')
  if (i < 0) return null
  const rootLabel = ref.slice(0, i)
  const relPath = ref.slice(i + 2)
  if (!rootLabel || !relPath) return null
  return { rootLabel, relPath }
}

/**
 * Resolve a ref to an ABSOLUTE path, but only if it lands inside a shared root.
 * Returns null on any traversal attempt or non-shared target — the access gate
 * for the file-serve route.
 */
export function resolveSharedRef(ref: string): { absolute: string; name: string } | null {
  const parsed = parseFileRef(ref)
  if (!parsed) return null
  const root = getSharedRoots().find((r) => r.label === parsed.rootLabel)
  if (!root) return null
  // Reject traversal segments outright before resolving.
  if (parsed.relPath.split('/').some((seg) => seg === '..')) return null
  const absolute = path.resolve(root.path, parsed.relPath)
  if (!isPathShared(absolute)) return null
  try {
    if (!fs.statSync(absolute).isFile()) return null
  } catch {
    return null
  }
  return { absolute, name: path.basename(absolute) }
}

/**
 * list_files (structured) — the directory-browser data source. Same bounded walk
 * as list_media but returns machine-readable rows with a `ref` + tunnel href, so
 * Merlin Control can render a real, openable file list (not a prose summary).
 */
export function listBrowsableFiles(args: ListMediaArgs): {
  ok: boolean
  error?: string
  count: number
  files: BrowsableFile[]
  roots: string[]
  /** Public tunnel base URL when the owner enabled tunnel sharing; else undefined. */
  tunnelUrl?: string
  /** Node's LAN address (http://192.168.x.x:3000) so a same-network viewer can
   *  stream DIRECT off the node — no tunnel, no service install. */
  lanUrl?: string
} {
  const base = listSharedMedia(args)
  if (!base.ok) return { ...base, files: [] }

  // Tunnel URL is advertised only when tunnel sharing is on (see node-catalog).
  const tunnelBase = getSettings().tunnelUrl || process.env.MERLIN_TUNNEL_URL || undefined
  const ip = localIPv4()
  const lanUrl = ip ? `http://${ip}:3000` : undefined

  const files: BrowsableFile[] = base.files.map((f) => {
    const ref = fileRef(f.root, f.path)
    return {
      ...f,
      ref,
      tunnelUrl: tunnelBase ? `${tunnelBase.replace(/\/$/, '')}/api/shared/file?ref=${encodeURIComponent(ref)}` : undefined,
    }
  })
  return { ok: true, count: files.length, files, roots: base.roots, tunnelUrl: tunnelBase, lanUrl }
}

/** First real LAN IPv4 (skips internal + APIPA) — mirrors node-catalog's helper. */
function localIPv4(): string | null {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) return i.address
    }
  }
  return null
}
