import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { registerProducer, registerEye } from '../witness-engine'
import { getSettings } from '../store'
import type { EyeConfig, Signal, EyeState } from '../witness-types'

interface SeenFile {
  path: string
  mtime: number
  size: number
}

const seen = new Map<string, SeenFile>()

function scanDir(dir: string): SeenFile[] {
  try {
    return readdirSync(dir).map((name) => {
      const full = join(dir, name)
      try {
        const st = statSync(full)
        return st.isFile() ? { path: full, mtime: st.mtimeMs, size: st.size } : null
      } catch { return null }
    }).filter((f): f is SeenFile => f !== null)
  } catch { return [] }
}

async function fileWatchProducer(eye: EyeState): Promise<Signal | null> {
  const source = eye.config.source
  if (!source) return null

  const now = scanDir(source)
  const existingKeys = new Set(now.map((f) => f.path))
  // Check for new or modified files
  let signal: Signal | null = null

  for (const f of now) {
    const prev = seen.get(f.path)
    if (!prev) {
      // New file
      seen.set(f.path, f)
      if (!signal) {
        signal = {
          id: `${eye.config.id}:${f.path}:${f.mtime}`,
          eyeId: eye.config.id,
          eyeType: 'file_watch',
          type: 'file_arrival',
          confidence: 1,
          summary: `New file: ${f.path}`,
          timestamp: new Date().toISOString(),
          location: eye.config.location,
          metadata: { path: f.path, size: f.size },
        }
      }
    } else if (f.mtime > prev.mtime) {
      seen.set(f.path, f)
      // Modified file — lower confidence for modifications
    }
  }

  // Clean up deleted files from seen
  for (const [path] of seen) {
    if (!existingKeys.has(path)) seen.delete(path)
  }

  return signal
}

export function enableFileWatchEye(config?: Partial<EyeConfig>): void {
  const watchedDirs = config?.source
    ? [config.source]
    : getSettings().watchedDirs || []

  for (const dir of watchedDirs) {
    if (!dir) continue
    registerProducer('file_watch', fileWatchProducer)
    registerEye({
      id: `file-watch:${dir.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      type: 'file_watch',
      label: `File Watch: ${dir}`,
      enabled: true,
      intervalMs: config?.intervalMs ?? 5_000,
      source: dir,
      location: config?.location,
      threshold: config?.threshold,
    })
  }
}
