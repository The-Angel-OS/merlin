/**
 * Next instrumentation — runs once at server startup.
 *
 * Starts the node-bus heartbeat + poll loop at BOOT so a headless Merlin node keeps
 * beaming (and answers the Console) even when no browser tab is open. Previously the
 * loop only started when /api/node/register or /api/node/stream was hit, so a node
 * nobody clicked went silent → Core marked it offline → the Console got no replies.
 *
 * Guarded to the nodejs runtime: setInterval + the local store don't exist on edge,
 * which is why this was kept out of instrumentation before. startNodeBusLoop() is
 * idempotent (process-wide singleton) and a no-op until the node is bound to an
 * endeavor — the route-side calls stay as belt-and-braces.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startNodeBusLoop } = await import('@/lib/node-bus')
  startNodeBusLoop()
}
