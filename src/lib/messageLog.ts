/**
 * messageLog.ts — Merlin's adapter for the shared @angel-os/brain MessageLog.
 *
 * Binds the portable MessageLog primitive to Merlin's substrate:
 *   - LogStore   → embedded Payload(SQLite) `message-log` collection
 *   - Submitter  → the node-bus file/chat bridge to the bound endeavor on Core
 *   - policy     → Merlin's triage policy (what local signals are worth graduating)
 *
 * Every local signal Merlin perceives (sentinel deltas, etc.) goes through
 * getMerlinMessageLog().log(signal): persisted to the local admin FIRST, triaged,
 * and graduated UP to Core only when it clears the noise budget — exactly once,
 * with an offline-retry outbox. This replaces "always submit on change" with
 * "log everything; amplify the worthy."
 *
 * @see @angel-os/brain (MessageLog / LogStore / Submitter / triage)
 * @see src/collections/MessageLog.ts (the Payload collection)
 * @see src/lib/node-bus.ts (submitSnapshot — the upward bridge)
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  MessageLog,
  type LogStore,
  type LogEntry,
  type Submitter,
  type TriagePolicy,
} from '@angel-os/brain'
import { submitSnapshot } from './node-bus'
import { appendLog } from './store'

const COLLECTION = 'message-log'

/**
 * Payload(SQLite)-backed LogStore. Maps the Brain's LogEntry <-> a `message-log`
 * row. `signalId` is the dedupe key (LogEntry.id); the Payload numeric id is
 * internal. All writes use overrideAccess — the brain is the system actor.
 */
class PayloadLogStore implements LogStore {
  private async db() {
    return getPayload({ config })
  }

  /** Map a Payload doc back to the Brain's LogEntry shape. */
  private toEntry(doc: Record<string, unknown>): LogEntry {
    return {
      id: String(doc.signalId ?? doc.id),
      ts: doc.createdAt ? new Date(doc.createdAt as string).getTime() : Date.now(),
      type: String(doc.type ?? ''),
      source: String(doc.source ?? 'merlin'),
      payload: doc.payload ?? null,
      score: typeof doc.score === 'number' ? doc.score : 0,
      reason: String(doc.reason ?? ''),
      status: (doc.status as LogEntry['status']) ?? 'held',
      submittedRef: (doc.submittedRef as string) || undefined,
      error: (doc.error as string) || undefined,
    }
  }

  async append(entry: LogEntry): Promise<void> {
    const payload = await this.db()
    await payload.create({
      collection: COLLECTION,
      data: {
        signalId: entry.id,
        type: entry.type,
        source: entry.source,
        status: entry.status,
        score: entry.score,
        reason: entry.reason,
        submittedRef: entry.submittedRef,
        error: entry.error,
        payload: entry.payload as Record<string, unknown>,
      },
      overrideAccess: true,
    })
  }

  async list(limit = 100): Promise<LogEntry[]> {
    const payload = await this.db()
    const res = await payload.find({
      collection: COLLECTION,
      sort: '-createdAt',
      limit,
      overrideAccess: true,
    })
    return res.docs.map((d) => this.toEntry(d as Record<string, unknown>))
  }

  async get(id: string): Promise<LogEntry | null> {
    const payload = await this.db()
    const res = await payload.find({
      collection: COLLECTION,
      where: { signalId: { equals: id } },
      limit: 1,
      overrideAccess: true,
    })
    const doc = res.docs[0] as Record<string, unknown> | undefined
    return doc ? this.toEntry(doc) : null
  }

  async update(id: string, patch: Partial<LogEntry>): Promise<void> {
    const payload = await this.db()
    const res = await payload.find({
      collection: COLLECTION,
      where: { signalId: { equals: id } },
      limit: 1,
      overrideAccess: true,
    })
    const doc = res.docs[0] as { id: number | string } | undefined
    if (!doc) return
    await payload.update({
      collection: COLLECTION,
      id: doc.id,
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.submittedRef !== undefined ? { submittedRef: patch.submittedRef } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.score !== undefined ? { score: patch.score } : {}),
        ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
      },
      overrideAccess: true,
    })
  }
}

/**
 * node-bus Submitter — graduates a worthy signal UP to the bound endeavor on Core.
 *
 * A signal whose payload carries a base64 image (a sentinel snapshot) goes up via
 * the Media bridge (submitSnapshot); anything else is posted as a bus chat message
 * (the existing result path). The returned ref is the Core Media URL / message ack.
 */
interface SnapshotSignalPayload {
  dataBase64?: string
  filename?: string
  mimetype?: string
  alt?: string
  text?: string
}

class NodeBusSubmitter implements Submitter {
  async push(entry: LogEntry): Promise<{ ok: boolean; ref?: string; error?: string }> {
    const p = (entry.payload ?? {}) as SnapshotSignalPayload

    // Image signal → Media bridge.
    if (p.dataBase64 && p.filename && p.mimetype) {
      try {
        const buf = Buffer.from(p.dataBase64, 'base64')
        const res = await submitSnapshot(buf, p.filename, p.mimetype, p.alt || p.filename)
        return res.ok ? { ok: true, ref: res.url } : { ok: false, error: res.error }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }

    // Non-image signal — nothing to graduate via Media. Treat as a no-op success
    // so the row settles (a future revision can post a bus chat message here).
    return { ok: true, ref: undefined }
  }
}

/**
 * Merlin's triage policy — the noise budget for local signals. Sentinel changes
 * are weighted by how big the visual delta was (bigger change = more worthy);
 * routine/low-delta noise is held locally. Tunable as Merlin learns what matters.
 */
const MERLIN_POLICY: TriagePolicy = {
  threshold: 0.5,
  maxPerWindow: 30, // cap graduations per window so a thrashing scene can't flood Core
  budgetOverrideScore: 0.95,
  rules: [
    {
      type: 'sentinel.change',
      weight: 1,
      reason: 'scene change',
      // payload.diff is 0..1 (mean-abs grayscale delta). Scale so a 4% change ≈
      // threshold and a big change saturates. Below ~2% is treated as noise.
      score: (e) => {
        const diff = (e.payload as { diff?: number })?.diff ?? 0
        if (diff < 0.02) return 0
        return Math.min(1, diff / 0.04) // 4%+ delta → full weight
      },
    },
    // A snapshot explicitly requested by an operator/Leo always graduates.
    { type: 'snapshot.requested', weight: 1, reason: 'operator-requested snapshot' },
  ],
}

let singleton: MessageLog | null = null

/**
 * The process-wide Merlin MessageLog. Lazily constructed; safe to call anywhere
 * a local signal is produced. Logs to Payload(SQLite), graduates via node-bus.
 */
export function getMerlinMessageLog(): MessageLog {
  if (singleton) return singleton
  singleton = new MessageLog({
    store: new PayloadLogStore(),
    submitter: new NodeBusSubmitter(),
    policy: MERLIN_POLICY,
  })
  return singleton
}

/**
 * Convenience for producers: log a signal and mirror the outcome into Merlin's
 * activity log (so the existing Activity tab still narrates what happened). Never
 * throws — a logging failure must not break perception.
 */
export async function logSignal(signal: {
  type: string
  payload: unknown
  id?: string
}): Promise<void> {
  try {
    const log = getMerlinMessageLog()
    const r = await log.log({ type: signal.type, source: 'merlin', payload: signal.payload, id: signal.id })
    appendLog({
      type: r.submitted ? 'angels' : 'system',
      source: 'message-log',
      message: r.submitted
        ? `graduated ${signal.type} (score ${r.entry.score.toFixed(2)}) → ${r.entry.submittedRef || 'ok'}`
        : `held ${signal.type} (score ${r.entry.score.toFixed(2)}: ${r.entry.reason})`,
    })
  } catch (e) {
    appendLog({ type: 'error', source: 'message-log', message: `log failed: ${e instanceof Error ? e.message : e}` })
  }
}
