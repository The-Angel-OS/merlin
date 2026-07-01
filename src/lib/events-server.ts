import { WebSocketServer } from 'ws'
import type { Server } from 'ws'
import { addSubscriber, removeSubscriber } from '@/lib/witness-engine'
import { appendLog } from '@/lib/store'

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
  if (instance()) return

  const p = resolvePort(port)
  const server = new WebSocketServer({ port: p })

  server.on('connection', (ws) => {
    const id = crypto.randomUUID()
    addSubscriber({ id, ws: ws as unknown as WebSocket, filter: () => true })
    ws.on('close', () => removeSubscriber(id))
    ws.on('error', () => removeSubscriber(id))
  })

  server.on('error', (err) => {
    appendLog({ type: 'error', source: 'events-server', message: `server error: ${err.message}` })
  })

  globalThis.__eventsServer = { server, running: true, port: p }
  appendLog({ type: 'system', source: 'events-server', message: `started on port ${p}` })
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
