import { WebSocketServer } from 'ws'
import type { Server } from 'ws'
import { addSubscriber, removeSubscriber } from '@/lib/witness-engine'
import { appendLog } from '@/lib/store'
import { logNodeError } from '@/lib/nodeError'

const DEFAULT_PORT = 3002

declare global {
  var __eventsServer: { server: Server; running: boolean; port: number } | undefined
}

function instance() {
  return globalThis.__eventsServer
}

function resolvePort(port?: number): number {
  if (port !== undefined) return port
  const env = process.env.EVENTS_WS_PORT
  if (env) {
    const p = parseInt(env, 10)
    if (!isNaN(p)) return p
  }
  return DEFAULT_PORT
}

export function startEventsServer(port?: number): void {
  const existing = instance()
  // Only short-circuit if the prior server is actually LIVE. A hot-reload can leave
  // a stale, closed instance on globalThis — checking mere existence would then skip
  // the rebind and report running:true for a dead server. Tear down a dead one first.
  if (existing && existing.running) return
  if (existing) {
    try { existing.server.close() } catch { /* already closed */ }
    delete globalThis.__eventsServer
  }

  const p = resolvePort(port)
  let server: WebSocketServer
  try {
    server = new WebSocketServer({ port: p })
  } catch (e) {
    logNodeError('events-server', `failed to create WS server on port ${p}: ${e instanceof Error ? e.message : String(e)}`)
    return
  }

  server.on('connection', (ws) => {
    const id = crypto.randomUUID()
    addSubscriber({ id, ws: ws as unknown as WebSocket, filter: () => true })
    ws.on('close', () => removeSubscriber(id))
    ws.on('error', () => removeSubscriber(id))
  })

  server.on('error', (err) => {
    // A bind failure (EADDRINUSE) surfaces here AFTER we optimistically stored the
    // instance — correct the lie (running:false) + free the slot so a later start
    // can retry, and escalate so the dead events channel is visible to Core.
    if (globalThis.__eventsServer?.server === server) {
      globalThis.__eventsServer.running = false
      delete globalThis.__eventsServer
    }
    logNodeError('events-server', `server error on port ${p}: ${err.message}`, err.stack)
  })

  server.on('listening', () => {
    appendLog({ type: 'system', source: 'events-server', message: `started on port ${p}` })
  })

  globalThis.__eventsServer = { server, running: true, port: p }
}

export function stopEventsServer(): void {
  const inst = instance()
  if (!inst) return
  inst.server.close()
  inst.running = false
  delete globalThis.__eventsServer
  appendLog({ type: 'system', source: 'events-server', message: 'stopped' })
}

export function getEventsServerUrl(): string {
  const inst = instance()
  const p = inst?.port ?? resolvePort()
  return `ws://localhost:${p}`
}

export function eventsServerStatus(): { running: boolean; port: number; url: string } {
  const inst = instance()
  const p = inst?.port ?? resolvePort()
  return {
    running: inst?.running ?? false,
    port: p,
    url: `ws://localhost:${p}`,
  }
}
