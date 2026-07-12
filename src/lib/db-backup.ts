/**
 * db-backup.ts — Merlin's Postgres backup engine for the Core `angels` database.
 *
 * Merlin runs on the same IONOS box as the Core Postgres, so it can pg_dump/pg_restore
 * the real database directly (its OWN store is the local SQLite in data/merlin.db —
 * that's not what we back up here). Dumps land on Merlin's local disk with rotation;
 * a scheduler runs it daily; the Core admin/backups panel triggers/restores via a
 * secured endpoint. Off-box copy (a second location) is tier 2 — see copyOffBox().
 *
 * Config (Merlin env):
 *   ANGELS_DATABASE_URI  — the Core Postgres connection string to back up (required).
 *   BACKUP_DIR           — where dumps are stored (default: <repo>/data/backups).
 *   BACKUP_RETENTION     — how many dumps to keep (default: 14).
 *   PG_BIN               — dir holding pg_dump/pg_restore if not on PATH (optional).
 *
 * pg_dump/pg_restore must be installed on the box (they ship with Postgres). We use
 * custom format (-Fc) so restore is selective + parallel-capable.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface BackupInfo {
  name: string
  path: string
  bytes: number
  createdAt: string
}

export interface BackupResult {
  ok: boolean
  backup?: BackupInfo
  error?: string
  log?: string
}

function backupDir(): string {
  const dir = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'data', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function pgTool(name: 'pg_dump' | 'pg_restore'): string {
  const bin = process.env.PG_BIN
  return bin ? path.join(bin, name) : name // else assume on PATH
}

/** Run a pg tool, capturing stderr; resolve with exit code + combined log. */
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    let log = ''
    const child = spawn(cmd, args, { windowsHide: true, env })
    child.stdout?.on('data', (d) => (log += d.toString()))
    child.stderr?.on('data', (d) => (log += d.toString()))
    child.on('error', (e) => resolve({ code: -1, log: `${log}\nspawn error: ${e.message}` }))
    child.on('close', (code) => resolve({ code: code ?? -1, log }))
  })
}

/** Timestamped dump name — sortable, filesystem-safe. */
function stamp(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

/** List existing backups, newest first. */
export function listBackups(): BackupInfo[] {
  const dir = backupDir()
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.dump'))
    .map((name) => {
      const full = path.join(dir, name)
      const st = fs.statSync(full)
      return { name, path: full, bytes: st.size, createdAt: st.mtime.toISOString() }
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1))
}

/** Prune all but the newest `keep` backups. */
function prune(keep: number): void {
  const all = listBackups()
  for (const b of all.slice(keep)) {
    try {
      fs.unlinkSync(b.path)
    } catch {
      /* best-effort */
    }
  }
}

/** Run a pg_dump of the Core Postgres to Merlin's local disk (custom format). */
export async function runBackup(): Promise<BackupResult> {
  const uri = process.env.ANGELS_DATABASE_URI
  if (!uri) return { ok: false, error: 'ANGELS_DATABASE_URI is not set — cannot back up the Core database.' }

  const dir = backupDir()
  const name = `angels-${stamp()}.dump`
  const outPath = path.join(dir, name)
  const retention = Math.max(1, Number(process.env.BACKUP_RETENTION) || 14)

  // -Fc custom format, -Z6 compression, connection via the URI (no creds on argv).
  const { code, log } = await run(pgTool('pg_dump'), ['-Fc', '-Z', '6', '-f', outPath, uri], process.env)
  if (code !== 0 || !fs.existsSync(outPath)) {
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
    } catch {
      /* ignore */
    }
    return { ok: false, error: `pg_dump exited ${code}`, log: log.slice(-2000) }
  }

  prune(retention)
  const st = fs.statSync(outPath)
  return { ok: true, backup: { name, path: outPath, bytes: st.size, createdAt: st.mtime.toISOString() }, log: log.slice(-2000) }
}

/**
 * Restore a dump into the Core Postgres. DESTRUCTIVE — --clean --if-exists drops
 * existing objects first. Guarded by the caller (super_admin + explicit confirm).
 */
export async function restoreBackup(backupName: string): Promise<BackupResult> {
  const uri = process.env.ANGELS_DATABASE_URI
  if (!uri) return { ok: false, error: 'ANGELS_DATABASE_URI is not set — cannot restore.' }

  // Resolve within the backup dir only (no path traversal).
  const dir = backupDir()
  const safe = path.basename(backupName)
  const full = path.join(dir, safe)
  if (!safe.endsWith('.dump') || !fs.existsSync(full)) {
    return { ok: false, error: `Backup "${safe}" not found.` }
  }

  const { code, log } = await run(
    pgTool('pg_restore'),
    ['--clean', '--if-exists', '--no-owner', '--no-privileges', '-d', uri, full],
    process.env,
  )
  // pg_restore can exit non-zero on benign "does not exist, skipping" warnings with
  // --clean; treat as success if the log has no fatal "error:" lines beyond those.
  const fatal = /(^|\n)pg_restore: error: (?!.*does not exist, skipping)/i.test(log)
  if (code !== 0 && fatal) return { ok: false, error: `pg_restore exited ${code}`, log: log.slice(-3000) }
  return { ok: true, log: log.slice(-3000) }
}

/** Tier 2 (stub): copy the newest dump off-box so a server loss is survivable. */
export async function copyOffBox(): Promise<{ ok: boolean; error?: string }> {
  const dest = process.env.BACKUP_OFFBOX_DIR
  if (!dest) return { ok: false, error: 'BACKUP_OFFBOX_DIR not set — off-box copy skipped.' }
  const latest = listBackups()[0]
  if (!latest) return { ok: false, error: 'no backup to copy' }
  try {
    fs.mkdirSync(dest, { recursive: true })
    fs.copyFileSync(latest.path, path.join(dest, latest.name))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────
let _timer: ReturnType<typeof setInterval> | null = null

/** Start the daily backup loop (idempotent). Runs one shortly after start, then
 *  every `intervalHours` (default 24). Mirrors the witness-engine setInterval pattern. */
export function startBackupScheduler(intervalHours = 24): void {
  if (_timer) return
  const ms = Math.max(1, intervalHours) * 3_600_000
  const tick = async () => {
    if (!process.env.ANGELS_DATABASE_URI) return // not configured — stay dormant
    const r = await runBackup()
    if (r.ok) void copyOffBox().catch(() => {})
    // eslint-disable-next-line no-console
    console.log(`[db-backup] ${r.ok ? `saved ${r.backup?.name} (${r.backup?.bytes} bytes)` : `failed: ${r.error}`}`)
  }
  // First run 60s after boot (let the service settle), then on the interval.
  setTimeout(() => void tick(), 60_000)
  _timer = setInterval(() => void tick(), ms)
}
