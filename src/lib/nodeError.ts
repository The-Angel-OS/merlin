/**
 * nodeError — Merlin's canonical error sink + escalation bridge to Core.
 *
 * Kept dependency-light on purpose (imports only `store` + node builtins) so every
 * engine can import it without creating an import cycle through node-bus/node-catalog
 * (which import the witness engine).
 *
 * `logNodeError` records locally (activity-log) AND escalates UP to Core's system
 * error log, so a Merlin failure becomes visible to LEO + the admin triage dashboard
 * instead of dying in local SQLite. Use it in every engine catch block.
 */
import os from 'node:os'
import { appendLog, getSettings } from './store'

// Dedup so a flapping engine (Ollama down, a camera throwing every tick) can't flood
// Core's application-logs / AI Bus / Gotify. Keyed by source; one escalation per
// source per window. The LOCAL activity-log still records every occurrence.
const _errEscalations = new Map<string, number>()
const ERR_ESCALATE_WINDOW_MS = 60_000

/**
 * Escalate a node error UP to Core's CANONICAL system error log.
 *
 * Posts to /api/log-ops/client-error as the node system-user (payload-token cookie);
 * Core resolves the tenant from the node's bound space → logError → application-logs
 * + the AI Bus `errors` channel + Gotify.
 *
 * Fire-and-forget + fail-soft: escalation must NEVER throw or block perception. An
 * unbound node (no token/space) silently skips — it stays local-only until locked on.
 */
export async function submitErrorToCore(input: { source: string; message: string; details?: string }): Promise<void> {
  try {
    const s = getSettings()
    if (!s.boundEndeavor || !s.nodeToken || !s.busSpaceId || !s.boundAngelsUrl) return

    const now = Date.now()
    const last = _errEscalations.get(input.source)
    if (last && now - last < ERR_ESCALATE_WINDOW_MS) return
    _errEscalations.set(input.source, now)
    // Bound the map so a wide spread of sources can't grow it unbounded.
    if (_errEscalations.size > 200) {
      for (const [k, t] of _errEscalations) if (now - t > ERR_ESCALATE_WINDOW_MS) _errEscalations.delete(k)
    }

    await fetch(`${s.boundAngelsUrl}/api/log-ops/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `payload-token=${s.nodeToken}` },
      body: JSON.stringify({
        source: `merlin:${os.hostname()}/${input.source}`,
        message: input.message,
        details: input.details,
        spaceId: s.busSpaceId,
      }),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => {})
  } catch {
    // never throw — escalation is a sidecar, not a dependency.
  }
}

/**
 * logNodeError — the canonical "an engine broke" sink for Merlin.
 *
 * Records locally (activity-log, type:'error', for the detail trail) AND escalates to
 * Core's system error log (deduped per source). Both legs are fail-soft. Use this in
 * every engine catch block instead of a bare `appendLog({ type: 'error' })`, which is
 * local-only and invisible to Core.
 *
 * Pass a specific `source` (e.g. `witness/eye/<id>`) so the per-source escalation
 * dedup doesn't let one subsystem's storm suppress another's first report.
 */
export function logNodeError(source: string, message: string, details?: string): void {
  void appendLog({ type: 'error', source, message })
  void submitErrorToCore({ source, message, details })
}
