/**
 * ollama.ts — provisioner for the first SHAREABLE RESOURCE: local Ollama compute.
 *
 * The "install-and-forget" goal: detect Ollama; if missing, install it (winget);
 * start it; pull models. Ollama is then advertised as `compute` in the node catalog
 * (probeOllama in node-catalog.ts). This is the template for future holon-fulfillment
 * resources (3D printers, CNC, …): each is a detect → install → configure → advertise
 * module with the same shape.
 */
import { execFile, spawn } from 'child_process'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

function sh(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0
      resolve({ code, stdout: stdout || '', stderr: stderr || (err?.message ?? '') })
    })
  })
}

async function ollamaFetch(path: string, ms = 2500): Promise<Response | null> {
  try {
    return await fetch(`${OLLAMA_URL}${path}`, { signal: AbortSignal.timeout(ms) })
  } catch {
    return null
  }
}

export interface OllamaStatus {
  installed: boolean
  running: boolean
  version: string
  models: string[]
  url: string
  binary: string
}

/** Detect Ollama: binary on PATH + the server running + installed models. */
export async function detectOllama(): Promise<OllamaStatus> {
  let binary = ''
  try {
    const { stdout } = await sh('where', ['ollama'], 4000)
    binary = stdout.split(/\r?\n/)[0]?.trim() || ''
  } catch {
    /* not on PATH */
  }
  let running = false
  let version = ''
  const v = await ollamaFetch('/api/version')
  if (v?.ok) {
    running = true
    version = ((await v.json().catch(() => ({}))) as { version?: string }).version || ''
  }
  let models: string[] = []
  const t = await ollamaFetch('/api/tags')
  if (t?.ok) {
    const d = (await t.json().catch(() => ({}))) as { models?: Array<{ name?: string }> }
    models = (d.models || []).map((m) => m.name || '').filter(Boolean)
  }
  return { installed: Boolean(binary) || running, running, version, models, url: OLLAMA_URL, binary }
}

/** Install Ollama via winget (silent). Long-running. No-op-ish if already installed. */
export async function installOllama(): Promise<{ ok: boolean; output: string }> {
  const { code, stdout, stderr } = await sh(
    'winget',
    ['install', '--id', 'Ollama.Ollama', '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements'],
    600_000,
  )
  return { ok: code === 0, output: (stdout || stderr).slice(-2000) }
}

/** Start `ollama serve` (detached) if not already running. */
export async function startOllama(): Promise<{ ok: boolean; alreadyRunning?: boolean; error?: string }> {
  const d = await detectOllama()
  if (d.running) return { ok: true, alreadyRunning: true }
  try {
    const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    await new Promise((r) => setTimeout(r, 1500))
    const d2 = await detectOllama()
    return { ok: d2.running }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Pull a model (e.g. "llama3.2", "qwen2.5"). Long-running (downloads GBs). */
export async function pullModel(name: string): Promise<{ ok: boolean; output: string }> {
  if (!name) return { ok: false, output: 'model name required' }
  const { code, stdout, stderr } = await sh('ollama', ['pull', name], 1_800_000)
  return { ok: code === 0, output: (stdout || stderr).slice(-2000) }
}
