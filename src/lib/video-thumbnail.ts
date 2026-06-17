/**
 * video-thumbnail.ts — lazy, on-demand video poster generation.
 *
 * When the media browser renders a directory, each video <img> hits
 * /api/thumbnail?file=<video>. If the user hasn't dropped a sibling poster,
 * this module extracts a representative frame with ffmpeg ON FIRST REQUEST and
 * caches it. Subsequent loads (and re-visits) stream straight from the cache.
 *
 * "Otherwise leave it alone": generated frames live in `data/thumb-cache/`,
 * never inside the user's media folders. The source video is read-only.
 *
 * Cache key includes size + mtime, so re-recording/editing a file regenerates
 * its poster automatically.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ts', '.mpg', '.mpeg',
])

const CACHE_DIR = path.resolve('data/thumb-cache')
const BOX = 1280 // max edge, px
const POS = 0.15 // fraction into the clip
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'

export function isVideoPath(p: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(p).toLowerCase())
}

function cacheKey(absPath: string, size: number, mtimeMs: number): string {
  const h = createHash('sha1').update(absPath).digest('hex').slice(0, 16)
  return `${h}_${size}_${Math.floor(mtimeMs)}.jpg`
}

// Dedupe concurrent requests for the same uncached poster (a grid load fires
// many requests at once; React strict-mode double-renders too).
const inFlight = new Map<string, Promise<string>>()

function run(cmd: string, args: string[], timeoutMs: number): Promise<number> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { windowsHide: true })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectRun(new Error('ffmpeg timeout'))
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      rejectRun(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveRun(code ?? 1)
    })
  })
}

async function probeDuration(absPath: string): Promise<number> {
  return new Promise((resolveProbe) => {
    let out = ''
    const child = spawn(
      FFPROBE,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', absPath],
      { windowsHide: true },
    )
    child.stdout.on('data', (d) => (out += d.toString()))
    child.on('error', () => resolveProbe(0))
    child.on('close', () => {
      const n = parseFloat(out.trim())
      resolveProbe(Number.isFinite(n) ? n : 0)
    })
  })
}

const VF = `scale=w=${BOX}:h=${BOX}:force_original_aspect_ratio=decrease:force_divisible_by=2`

async function generate(absVideo: string, outPath: string): Promise<void> {
  const duration = await probeDuration(absVideo)
  const seek = duration > 0 ? Math.max(1, duration * POS) : 1
  const tmp = `${outPath}.${process.pid}.tmp.jpg`

  // Input-seek (-ss before -i) is fast even on multi-GB files.
  let code = await run(
    FFMPEG,
    ['-y', '-ss', seek.toFixed(3), '-i', absVideo, '-frames:v', '1', '-vf', VF, '-q:v', '3', tmp],
    120_000,
  ).catch(() => 1)

  // Clip shorter than the seek point — retry from the start.
  if (code !== 0 || !fs.existsSync(tmp)) {
    code = await run(
      FFMPEG,
      ['-y', '-i', absVideo, '-frames:v', '1', '-vf', VF, '-q:v', '3', tmp],
      120_000,
    ).catch(() => 1)
  }

  if (code !== 0 || !fs.existsSync(tmp)) {
    try { await fsp.unlink(tmp) } catch { /* ignore */ }
    throw new Error(`ffmpeg failed for ${absVideo}`)
  }
  // Atomic publish so a partial file is never served.
  await fsp.rename(tmp, outPath)
}

/**
 * Return the absolute path to a cached JPEG poster for `absVideo`, generating
 * it on first request. Throws if generation fails.
 */
export async function getOrCreateVideoThumb(absVideo: string): Promise<string> {
  const stats = await fsp.stat(absVideo)
  const outPath = path.join(CACHE_DIR, cacheKey(absVideo, stats.size, stats.mtimeMs))

  if (fs.existsSync(outPath)) return outPath

  const existing = inFlight.get(outPath)
  if (existing) return existing

  const task = (async () => {
    await fsp.mkdir(CACHE_DIR, { recursive: true })
    if (!fs.existsSync(outPath)) await generate(absVideo, outPath)
    return outPath
  })().finally(() => inFlight.delete(outPath))

  inFlight.set(outPath, task)
  return task
}
