/**
 * camera.ts — capture a still frame from a local camera via ffmpeg (Windows DirectShow).
 *
 * Powers the snap_camera node skill: turn a disused laptop into an active sentinel
 * that can grab + submit a frame on demand or on a trigger. ffmpeg must be on PATH
 * (or set FFMPEG_PATH). No native deps — shells out to ffmpeg, reads the temp file.
 */
import { execFile } from 'child_process'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'

function run(args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      FFMPEG,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? ((err as { code: number }).code)
            : err
              ? 1
              : 0
        resolve({ code, stderr: stderr || (err?.message ?? '') })
      },
    )
  })
}

/** List open windows by title (for window-monitoring sources, e.g. Bluestacks). */
export async function listWindows(): Promise<{ ok: boolean; windows: string[]; error?: string }> {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-Command', "Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty MainWindowTitle"],
      { timeout: 8000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) return resolve({ ok: false, windows: [], error: err.message })
        const windows = Array.from(
          new Set(
            String(stdout || '')
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        )
        resolve({ ok: true, windows })
      },
    )
  })
}

/** Snap a single frame of a specific on-screen WINDOW via gdigrab (by title). */
export async function snapWindow(title: string): Promise<SnapResult> {
  const chosen = (title || '').trim()
  if (!chosen) return { ok: false, error: 'no window title given' }
  const out = join(tmpdir(), `merlin-win-${Date.now()}.jpg`)
  const { code, stderr } = await run(
    ['-hide_banner', '-f', 'gdigrab', '-framerate', '1', '-i', `title=${chosen}`, '-frames:v', '1', '-update', '1', '-q:v', '3', '-y', out],
    15000,
  )
  try {
    const buffer = await readFile(out)
    await unlink(out).catch(() => {})
    if (!buffer.length) return { ok: false, device: `window:${chosen}`, error: `capture produced no data (ffmpeg exit ${code})` }
    return { ok: true, buffer, device: `window:${chosen}`, mimetype: 'image/jpeg', filename: `window-${Date.now()}.jpg` }
  } catch {
    const tail = stderr.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 300)
    return { ok: false, device: `window:${chosen}`, error: `window capture failed (exit ${code}) — is the window open + not minimized? ${tail}` }
  }
}

/** Unified capture: a window (gdigrab) if `window` is given, else a camera (dshow). */
export async function captureFrame(opts: { device?: string; window?: string } = {}): Promise<SnapResult> {
  if (opts.window && opts.window.trim()) return snapWindow(opts.window.trim())
  return snapCamera(opts.device)
}

/** List local video capture devices (Windows DirectShow). */
export async function listCameras(): Promise<{ ok: boolean; cameras: string[]; error?: string }> {
  try {
    const { stderr } = await run(['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], 8000)
    const cameras: string[] = []
    const re = /"([^"]+)"\s+\(video\)/g // lines like: [dshow @ ...] "Integrated Camera" (video)
    let m: RegExpExecArray | null
    while ((m = re.exec(stderr))) cameras.push(m[1])
    return { ok: true, cameras }
  } catch (e) {
    return { ok: false, cameras: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export interface SnapResult {
  ok: boolean
  buffer?: Buffer
  device?: string
  mimetype?: string
  filename?: string
  error?: string
}

/** Snap one frame from the chosen device (or the first available) → JPEG buffer. */
export async function snapCamera(device?: string): Promise<SnapResult> {
  let chosen = (device || '').trim()
  if (!chosen) {
    const list = await listCameras()
    chosen = list.cameras[0] || ''
  }
  if (!chosen) return { ok: false, error: 'no camera device found (is one connected? is ffmpeg installed?)' }

  const out = join(tmpdir(), `merlin-snap-${Date.now()}.jpg`)
  // Robust grab: many webcams emit a blank/no first frame, and image2 errors when
  // muxing multiple frames to one filename — so pull a few warm-up frames with
  // `-update 1` (each overwrites the file) and keep the last good one.
  const { code, stderr } = await run(
    ['-hide_banner', '-f', 'dshow', '-rtbufsize', '64M', '-i', `video=${chosen}`, '-frames:v', '8', '-update', '1', '-q:v', '3', '-y', out],
    20000,
  )
  try {
    const buffer = await readFile(out)
    await unlink(out).catch(() => {})
    if (!buffer.length) return { ok: false, device: chosen, error: `capture produced no data (ffmpeg exit ${code})` }
    const stamp = Date.now()
    return { ok: true, buffer, device: chosen, mimetype: 'image/jpeg', filename: `snapshot-${stamp}.jpg` }
  } catch {
    const tail = stderr.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 300)
    return { ok: false, device: chosen, error: `capture failed (exit ${code}): ${tail}` }
  }
}
