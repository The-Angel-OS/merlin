import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'

const { addSubscriber, removeSubscriber } = vi.hoisted(() => ({
  addSubscriber: vi.fn(),
  removeSubscriber: vi.fn(),
}))

vi.mock('@/lib/witness-engine', () => ({ addSubscriber, removeSubscriber }))
vi.mock('@/lib/store', () => ({ appendLog: vi.fn() }))

const TEST_PORT = 18901

import {
  startEventsServer,
  stopEventsServer,
  getEventsServerUrl,
  eventsServerStatus,
} from '@/lib/events-server'

beforeEach(() => {
  addSubscriber.mockClear()
  removeSubscriber.mockClear()
  stopEventsServer()
})

afterEach(() => {
  stopEventsServer()
})

describe('lifecycle', () => {
  it('starts and reports running', () => {
    startEventsServer(TEST_PORT)
    const status = eventsServerStatus()
    expect(status.running).toBe(true)
    expect(status.port).toBe(TEST_PORT)
    expect(status.url).toBe(`ws://localhost:${TEST_PORT}`)
  })

  it('stops and reports not running', () => {
    startEventsServer(TEST_PORT)
    stopEventsServer()
    expect(eventsServerStatus().running).toBe(false)
  })

  it('is idempotent — start twice does not error', () => {
    startEventsServer(TEST_PORT)
    startEventsServer(TEST_PORT + 1)
    const status = eventsServerStatus()
    expect(status.running).toBe(true)
    expect(status.port).toBe(TEST_PORT)
  })

  it('getEventsServerUrl returns the URL', () => {
    startEventsServer(TEST_PORT)
    expect(getEventsServerUrl()).toBe(`ws://localhost:${TEST_PORT}`)
  })

  it('eventsServerStatus returns not running before start', () => {
    expect(eventsServerStatus().running).toBe(false)
  })
})

describe('connection handling', () => {
  it('registers a subscriber on client connect', async () => {
    startEventsServer(TEST_PORT)
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`)
    await vi.waitFor(() => expect(addSubscriber).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(addSubscriber).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.any(Function) }),
    )
    ws.close()
  })

  it('removes the subscriber on client disconnect', async () => {
    startEventsServer(TEST_PORT)

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`)
    await vi.waitFor(() => expect(addSubscriber).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const capturedId = addSubscriber.mock.calls[0][0].id

    ws.close()
    await vi.waitFor(() => expect(removeSubscriber).toHaveBeenCalledWith(capturedId), { timeout: 3000 })
  })

  it('registers with a truthy filter', async () => {
    startEventsServer(TEST_PORT)
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`)
    await vi.waitFor(() => expect(addSubscriber).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const sub = addSubscriber.mock.calls[0][0]
    expect(sub.filter()).toBe(true)
    ws.close()
  })
})
