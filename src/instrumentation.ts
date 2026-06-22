/**
 * Next.js instrumentation — runs once on server boot.
 * Starts the node bus loop (heartbeat + command poll). No-op until the node is
 * locked onto an endeavor (registerNode persists boundEndeavor).
 * @see src/lib/node-bus.ts + Core docs/architecture/NODE_BUS_COMMS.md
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startNodeBusLoop } = await import('@/lib/node-bus')
  startNodeBusLoop()
}
