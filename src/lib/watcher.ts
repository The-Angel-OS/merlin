/**
 * watcher.ts — Chokidar file watcher singleton
 * Persists across requests in production (next start).
 * Uses chokidar v5 (ESM) via dynamic import.
 */
import { appendLog, upsertFile, getSettings } from './store'
import { extname, basename } from 'path'
import { statSync } from 'fs'

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
  name: string
  timestamp: string
  size?: number
}

type WatchListener = (event: WatchEvent) => void

// Module-level singleton
const listeners = new Set<WatchListener>()
let initialized = false

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'])
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg'])

function categorize(ext: string) {
  const e = ext.toLowerCase()
  if (VIDEO_EXTS.has(e)) return 'video'
  if (IMAGE_EXTS.has(e)) return 'image'
  if (e === '.srt' || e === '.vtt') return 'srt'
  if (AUDIO_EXTS.has(e)) return 'audio'
  if (['.pdf', '.doc', '.docx', '.txt', '.md'].includes(e)) return 'document'
  return 'other'
}

export async function initWatcher(): Promise<void> {
  if (initialized) return
  initialized = true

  const settings = getSettings()
  const dirs = settings.watchedDirs.filter(Boolean)
  if (dirs.length === 0) return

  try {
    const { watch } = await import('chokidar')
    const watcher = watch(dirs, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
    })

    watcher.on('add', (path: string) => {
      try {
        const stats = statSync(path)
        const name = basename(path)
        const ext = extname(path)
        const event: WatchEvent = { type: 'add', path, name, timestamp: new Date().toISOString(), size: stats.size }

        upsertFile({
          path, name, ext,
          category: categorize(ext) as any,
          size: stats.size,
          detectedAt: new Date().toISOString(),
          status: 'new',
        })

        appendLog({ type: 'file_arrived', source: 'watcher', message: `New file: ${name}`, metadata: { path, size: stats.size, category: categorize(ext) } })
        broadcast(event)
      } catch {}
    })

    watcher.on('unlink', (path: string) => {
      const event: WatchEvent = { type: 'unlink', path, name: basename(path), timestamp: new Date().toISOString() }
      broadcast(event)
    })

    appendLog({ type: 'system', source: 'watcher', message: `File watcher started — watching ${dirs.length} directories` })
  } catch (err) {
    appendLog({ type: 'error', source: 'watcher', message: `Watcher init failed: ${err}` })
  }
}

function broadcast(event: WatchEvent) {
  listeners.forEach(fn => { try { fn(event) } catch {} })
}

export function addWatchListener(fn: WatchListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getListenerCount(): number {
  return listeners.size
}
