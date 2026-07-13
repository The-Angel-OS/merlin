/**
 * tunnel.ts — Merlin owns its own reverse tunnel. Toggling the "Tunnel" share on
 * makes Merlin DISCOVER its public URL automatically and persist it to data/settings.json
 * (read/written by Merlin itself) — never .env, never hand-typed. Config-free: the
 * connection is the only setup.
 *
 * Two modes, auto-selected:
 *  - named  — a cloudflared named-tunnel config exists (~/.cloudflared/config.yml). The
 *             URL is the ingress hostname; a service/daemon runs cloudflared, so we just
 *             record the URL (no duplicate spawn). This is the flagship path.
 *  - quick  — no named config: spawn `cloudflared tunnel --url` and capture the assigned
 *             *.trycloudflare.com URL from its output. Zero account/DNS (member nodes).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getSettings, updateSettings, appendLog } from '@/lib/store'

type TunnelMode = 'named' | 'quick' | 'off'

declare global {
  // eslint-disable-next-line no-var
  var __merlinTunnel: { proc?: ChildProcess; mode: TunnelMode; url: string } | undefined
}

function state() {
  if (!globalThis.__merlinTunnel) globalThis.__merlinTunnel = { mode: 'off', url: '' }
  return globalThis.__merlinTunnel
}

/** Locate the cloudflared binary (PATH, or the default Windows install location). */
export function cloudflaredPath(): string {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    'cloudflared',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (c === 'cloudflared') return c // rely on PATH
    try {
      if (fs.existsSync(c)) return c
    } catch {
      /* skip */
    }
  }
  return 'cloudflared'
}

/** If a named-tunnel config exists, return its public hostname (the ingress rule). */
function detectNamedHostname(): string | null {
  const cfg = path.join(os.homedir(), '.cloudflared', 'config.yml')
  try {
    if (!fs.existsSync(cfg)) return null
    const raw = fs.readFileSync(cfg, 'utf-8')
    const m = raw.match(/hostname:\s*([^\s#]+)/i)
    return m ? m[1].trim() : null
  } catch {
    return null
  }
}

function servingPort(): number {
  const p = Number(process.env.PORT)
  return Number.isFinite(p) && p > 0 ? p : 3000
}

export function tunnelStatus(): { running: boolean; mode: TunnelMode; url: string; named: boolean } {
  const s = state()
  return { running: s.mode !== 'off', mode: s.mode, url: getSettings().tunnelUrl || s.url || '', named: Boolean(detectNamedHostname()) }
}

/**
 * Reconcile the tunnel to the desired on/off. Best-effort, non-blocking for the quick
 * path (the URL lands in settings when cloudflared reports it). Returns the immediate status.
 */
export function reconcileTunnel(on: boolean): { mode: TunnelMode; url: string; starting?: boolean; error?: string } {
  const s = state()

  if (!on) {
    if (s.proc) {
      try {
        s.proc.kill()
      } catch {
        /* already gone */
      }
    }
    s.proc = undefined
    s.mode = 'off'
    s.url = ''
    updateSettings({ tunnelUrl: '' })
    return { mode: 'off', url: '' }
  }

  // Named tunnel: the URL is known from config; a service/daemon owns the process.
  const named = detectNamedHostname()
  if (named) {
    const url = `https://${named}`
    s.mode = 'named'
    s.url = url
    updateSettings({ tunnelUrl: url })
    appendLog({ type: 'system', source: 'tunnel', message: `tunnel on (named) → ${url}` })
    return { mode: 'named', url }
  }

  // Already running a quick tunnel — nothing to do.
  if (s.proc && s.mode === 'quick') return { mode: 'quick', url: getSettings().tunnelUrl || s.url }

  // Quick tunnel: spawn and capture the assigned URL from cloudflared's output.
  try {
    const proc = spawn(cloudflaredPath(), ['tunnel', '--url', `http://localhost:${servingPort()}`], {
      windowsHide: true,
    })
    s.proc = proc
    s.mode = 'quick'
    s.url = ''
    const onData = (buf: Buffer) => {
      const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      if (m && getSettings().tunnelUrl !== m[0]) {
        s.url = m[0]
        updateSettings({ tunnelUrl: m[0] })
        appendLog({ type: 'system', source: 'tunnel', message: `tunnel on (quick) → ${m[0]}` })
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.on('exit', () => {
      if (state().proc === proc) {
        state().proc = undefined
        state().mode = 'off'
      }
    })
    return { mode: 'quick', url: '', starting: true }
  } catch (e) {
    s.mode = 'off'
    return { mode: 'off', url: '', error: e instanceof Error ? e.message : String(e) }
  }
}
