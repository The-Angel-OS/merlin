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
import { getSharedRoots, isPathShared, type MediaRootConfig } from '@/lib/media-roots'

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
