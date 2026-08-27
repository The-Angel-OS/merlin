/**
 * Next's one boot hook — runs once when the server starts.
 *
 * The node-bus heartbeat used to begin only when something touched
 * /api/node/register or /api/node/stream. Merlin therefore served happily while
 * reporting to nobody: after a restart the loop simply never started, and the
 * node sat grey on Core's telemetry for 62 days with nothing broken enough to
 * notice. A background loop that needs a visitor to start is not a background
 * loop.
 *
 * startNodeBusLoop is idempotent and no-ops until the node is bound to an
 * endeavor, so calling it here costs nothing on an unbound install.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startNodeBusLoop } = await import('@/lib/node-bus')
  startNodeBusLoop()
}
