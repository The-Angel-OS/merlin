import { NextRequest, NextResponse } from 'next/server'
import { listBackups, runBackup, restoreBackup, startBackupScheduler } from '@/lib/db-backup'

/**
 * Backup ops — Merlin's control surface for the Core Postgres backups. Called by the
 * Core `admin/backups` panel over Merlin's tunnel. Secured by a shared secret
 * (BACKUP_OPS_KEY) — restore is destructive so it also requires an explicit confirm.
 *
 *   GET                         → { backups: [...] }           (list, newest first)
 *   POST { action: 'run' }      → { ok, backup }               (pg_dump now)
 *   POST { action: 'restore', name, confirm:'RESTORE' } → { ok } (pg_restore, DESTRUCTIVE)
 *
 * Auth: Authorization: Bearer <BACKUP_OPS_KEY>  (or x-ops-key header).
 */

// Kick the daily scheduler when this module first loads (Merlin serves a request).
// For a guaranteed boot-start, also call startBackupScheduler() from the engine init.
startBackupScheduler(Number(process.env.BACKUP_INTERVAL_HOURS) || 24)

function authorized(req: NextRequest): boolean {
  const secret = process.env.BACKUP_OPS_KEY
  if (!secret) return false // fail-closed: no secret configured → no remote ops
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const headerKey = req.headers.get('x-ops-key')
  return bearer === secret || headerKey === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ backups: listBackups(), configured: !!process.env.ANGELS_DATABASE_URI })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { action?: string; name?: string; confirm?: string }

  if (body.action === 'run') {
    const r = await runBackup()
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  }

  if (body.action === 'restore') {
    if (body.confirm !== 'RESTORE') {
      return NextResponse.json({ error: 'restore is destructive — resend with confirm: "RESTORE"' }, { status: 400 })
    }
    if (!body.name) return NextResponse.json({ error: 'name (backup file) is required' }, { status: 400 })
    const r = await restoreBackup(body.name)
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  }

  return NextResponse.json({ error: 'unknown action — use "run" or "restore"' }, { status: 400 })
}
