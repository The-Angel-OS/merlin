/**
 * leoTools.ts — curated LOCAL tool registry for Merlin's on-box LEO.
 *
 * Each tool is a function over data this node already owns (settings.json,
 * the filesystem, the transcribe script). The agent loop (leoAgent.ts) dispatches
 * these by name. Anthropic tool-use shape: { name, description, input_schema }.
 *
 * ponytail: dispatch_to_channel (reach up to Core Spaces) lands next slice once
 * the Core endpoint is confirmed — kept out so we don't ship a guessed contract.
 */
import { spawn } from 'child_process'
import { readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { getSettings, updateSettings, type Settings } from './store'
import type { Tool } from './leoBrain'

export type { Tool }

// Never echo these back in full — read_config reports 'set' / 'unset'.
const SECRET_KEYS = [
  'youtubeApiKey', 'youtubeClientSecret', 'youtubeRefreshToken',
  'angelsApiKey', 'anthropicApiKey',
]

export const TOOLS: Tool[] = [
  {
    name: 'read_config',
    description:
      'Read this Merlin node\'s local settings (data/settings.json). Secret values are returned as "set" or "unset", never the actual secret.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const s = getSettings() as unknown as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(s)) {
        out[k] = SECRET_KEYS.includes(k) ? (v ? 'set' : 'unset') : v
      }
      return out
    },
  },
  {
    name: 'set_config',
    description:
      'Update local settings (data/settings.json). Pass only the keys to change, e.g. {"angelsApiUrl":"https://www.spacesangels.com"} or {"anthropicApiKey":"sk-..."}. Unknown keys are ignored.',
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'object',
          description: 'Partial settings object — only the fields to change.',
        },
      },
      required: ['updates'],
    },
    run: async (input) => {
      const updates = input.updates as Record<string, unknown> | undefined
      if (!updates || typeof updates !== 'object') throw new Error('updates object required')
      const allowed = new Set(Object.keys(getSettings()))
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(updates)) if (allowed.has(k)) clean[k] = v
      updateSettings(clean as Partial<Settings>)
      return { ok: true, changed: Object.keys(clean), ignored: Object.keys(updates).filter((k) => !allowed.has(k)) }
    },
  },
  {
    name: 'transcribe_url',
    description:
      'Download a video/audio URL and transcribe it locally with Whisper. Idempotent — re-running the same video id skips. Returns the script output (transcript file paths).',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'YouTube/media URL or bare video id' },
        outDir: { type: 'string', description: 'optional output directory' },
      },
      required: ['url'],
    },
    run: async (input) => {
      const url = String(input.url || '').trim()
      if (!url) throw new Error('url required')
      const script = join(process.cwd(), 'public', 'scripts', 'url_transcribe.py')
      const dir = String(input.outDir || join(process.cwd(), 'data', 'transcripts'))
      return runPython(script, [url, dir])
    },
  },
  {
    name: 'list_media',
    description:
      'List media files (video/audio) in a directory on this node, newest first.',
    input_schema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'absolute directory; defaults to first watched dir' },
      },
    },
    run: async (input) => {
      const target = String(input.dir || getSettings().watchedDirs?.[0] || join(process.cwd(), 'data'))
      if (!existsSync(target)) return { dir: target, error: 'not found', files: [] }
      const files = readdirSync(target)
        .filter((f) => /\.(mp4|mkv|mov|webm|m4a|mp3)$/i.test(f))
        .map((f) => {
          const st = statSync(join(target, f))
          return { name: f, sizeMB: +(st.size / 1_048_576).toFixed(1), mtime: st.mtime.toISOString() }
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime))
        .slice(0, 200)
      return { dir: target, count: files.length, files }
    },
  },
  {
    name: 'start_tunnel',
    description:
      'Expose this Merlin node to the public internet with ZERO setup via a Cloudflare quick tunnel (no account, no port-forward). Spawns `cloudflared`, returns a public https://*.trycloudflare.com URL that maps to this node\'s local port, and stores it in settings as tunnelUrl. The URL is ephemeral — a fresh one is issued each call. Requires the `cloudflared` binary on PATH.',
    input_schema: {
      type: 'object',
      properties: {
        port: { type: 'number', description: 'local port to expose; defaults to the node port (settings.port)' },
      },
    },
    run: async (input) => {
      // Default to 3000 — the port this Next node actually serves on (settings.port is unrelated config).
      const port = Number(input.port) || 3000
      const result = await startTunnel(port)
      if (result.url) updateSettings({ tunnelUrl: result.url })
      return result
    },
  },
]

/**
 * Spawn a cloudflared quick tunnel and resolve once it prints its public URL.
 * Unlike runPython, the process is LONG-LIVED: we scrape stderr for the
 * trycloudflare.com URL, resolve on first match, and leave cloudflared running.
 */
function startTunnel(
  port: number,
): Promise<{ ok: boolean; url?: string; pid?: number; error?: string }> {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        windowsHide: true,
      })
    } catch (err) {
      return resolve({ ok: false, error: `failed to spawn cloudflared: ${String(err)}` })
    }

    let settled = false
    const finish = (r: { ok: boolean; url?: string; pid?: number; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }

    // cloudflared logs the URL to stderr; watch both streams to be safe.
    const onData = (d: Buffer) => {
      const m = d.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      if (m) finish({ ok: true, url: m[0], pid: child.pid })
    }
    child.stderr.on('data', onData)
    child.stdout.on('data', onData)

    child.on('error', (err) => {
      const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'cloudflared not found on PATH — install it (winget install Cloudflare.cloudflared) to enable zero-config sharing'
        : String(err)
      finish({ ok: false, error: msg })
    })
    child.on('close', (code) => finish({ ok: false, error: `cloudflared exited (code ${code}) before announcing a URL` }))

    const timer = setTimeout(
      () => finish({ ok: false, error: 'timed out after 25s waiting for cloudflared URL' }),
      25_000,
    )
    // Don't let the tunnel process keep the event loop from idling; it stays alive on its own.
    child.unref()
  })
}

let autoTunnelStarted = false

/**
 * Auto-provision a DYNAMIC tunnel on boot — the replacement for a fixed named
 * tunnel (e.g. MERLIN_TUNNEL_URL / merlin.payloadnuke.com). Called once when the
 * node bus loop starts (lock-on). Behaviour:
 *   - Respects the operator: only runs when tunnel SHARING is on (loadShares) — a
 *     node that didn't opt into a public tunnel never gets one.
 *   - Defers to a preconfigured persistent tunnel (MERLIN_TUNNEL_URL) if present.
 *   - A prior run's settings.tunnelUrl is a DEAD ephemeral URL, so we always spawn
 *     a fresh quick tunnel and overwrite it, then RE-REGISTER immediately so Core
 *     learns the live URL without waiting for the next heartbeat. Core resolves
 *     every media/file link against this current URL at request time.
 * Idempotent per process; fail-soft (missing cloudflared just logs + retries next tick).
 */
export async function ensureAutoTunnel(port = 3000): Promise<void> {
  if (autoTunnelStarted) return
  if (process.env.MERLIN_TUNNEL_URL) return // a persistent named tunnel is configured — respect it
  try {
    const { loadShares } = await import('./shares')
    if (!loadShares().shares.tunnel) return // tunnel sharing off → no public tunnel
  } catch {
    return
  }
  autoTunnelStarted = true
  const result = await startTunnel(port)
  if (result.ok && result.url) {
    updateSettings({ tunnelUrl: result.url })
    try {
      const { registerNode } = await import('./node-bus')
      await registerNode() // push the live URL to Core now, not in 2 minutes
    } catch {
      /* next heartbeat will carry it */
    }
  } else {
    autoTunnelStarted = false // allow a retry on the next boot tick
  }
}

function runPython(
  script: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const py = process.platform === 'win32' ? 'python' : 'python3'
    const child = spawn(py, [script, ...args], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) =>
      resolve({ exitCode: code ?? -1, stdout: stdout.slice(-4000), stderr: stderr.slice(-2000) }),
    )
    child.on('error', (err) => resolve({ exitCode: -1, stdout: '', stderr: String(err) }))
  })
}
