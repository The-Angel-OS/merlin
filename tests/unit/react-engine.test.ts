import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/store', () => ({
  appendLog: vi.fn(),
  updateSettings: vi.fn(),
  createIncident: vi.fn(),
  getSettings: vi.fn(() => ({
    boloVisionModel: '',
    ollamaModel: 'llava',
    ollamaUrl: 'http://127.0.0.1:11434',
    sentinelThreshold: 0.04,
    sentinelIntervalMs: 5000,
  })),
}))

vi.mock('@/lib/node-bus', () => ({ submitSnapshot: vi.fn() }))
vi.mock('@/lib/camera', () => ({ captureFrame: vi.fn() }))
vi.mock('@/lib/witness-engine', () => ({ activeWitnesses: vi.fn(() => []) }))

import {
  registerReflex,
  unregisterReflex,
  listReflexes,
  ingestSignal,
  startReactEngine,
  stopReactEngine,
  reactStatus,
} from '@/lib/react-engine'

beforeEach(() => {
  stopReactEngine()
  // Clear all reflexes from the global store
  if ((globalThis as any).__reactEngine) {
    ;(globalThis as any).__reactEngine.reflexes.clear()
    ;(globalThis as any).__reactEngine.throttle.clear()
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const noop = async () => {}

describe('reflex lifecycle', () => {

  it('registers a reflex and lists it', () => {
    registerReflex({
      name: 'test-reflex',
      description: 'A test reflex',
      priority: 50,
      cooldownMs: 1000,
      autoStart: true,
      match: () => false,
      action: noop,
    })
    const reflexes = listReflexes()
    expect(reflexes).toHaveLength(1)
    expect(reflexes[0].name).toBe('test-reflex')
  })

  it('unregisters a reflex', () => {
    registerReflex({
      name: 'temp-reflex',
      description: 'Will be removed',
      priority: 10,
      cooldownMs: 500,
      autoStart: true,
      match: () => true,
      action: noop,
    })
    expect(listReflexes()).toHaveLength(1)
    unregisterReflex('temp-reflex')
    expect(listReflexes()).toHaveLength(0)
  })

  it('lists reflexes in priority order (highest first)', () => {
    registerReflex({ name: 'low', description: '', priority: 10, cooldownMs: 100, autoStart: true, match: () => false, action: noop })
    registerReflex({ name: 'high', description: '', priority: 100, cooldownMs: 100, autoStart: true, match: () => false, action: noop })
    registerReflex({ name: 'mid', description: '', priority: 50, cooldownMs: 100, autoStart: true, match: () => false, action: noop })
    const names = listReflexes().map((r) => r.name)
    expect(names).toEqual(['high', 'mid', 'low'])
  })
})

describe('signal processing', () => {
  const asyncFn = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => { asyncFn.mockClear() })

  it('does not fire reflexes when engine is stopped', async () => {
    registerReflex({
      name: 'stopped-test',
      description: '',
      priority: 1,
      cooldownMs: 0,
      autoStart: true,
      match: () => true,
      action: asyncFn,
    })
    ingestSignal({
      id: 'test-1',
      eyeId: 'eye-1',
      eyeType: 'camera',
      type: 'motion',
      confidence: 1,
      summary: 'test',
      timestamp: new Date().toISOString(),
    })
    expect(asyncFn).not.toHaveBeenCalled()
  })

  it('fires reflex when engine is started and signal matches', () => {
    registerReflex({
      name: 'match-test',
      description: '',
      priority: 1,
      cooldownMs: 0,
      autoStart: true,
      match: (s) => s.type === 'motion',
      action: asyncFn,
    })
    startReactEngine()
    ingestSignal({
      id: 'test-2',
      eyeId: 'eye-1',
      eyeType: 'camera',
      type: 'motion',
      confidence: 0.8,
      summary: 'movement detected',
      timestamp: new Date().toISOString(),
    })
    expect(asyncFn).toHaveBeenCalledTimes(1)
  })

  it('does not fire reflex when signal does not match', () => {
    registerReflex({
      name: 'no-match-test',
      description: '',
      priority: 1,
      cooldownMs: 0,
      autoStart: true,
      match: (s) => s.type === 'file_arrival',
      action: asyncFn,
    })
    startReactEngine()
    ingestSignal({
      id: 'test-3',
      eyeId: 'eye-1',
      eyeType: 'camera',
      type: 'motion',
      confidence: 0.8,
      summary: 'movement',
      timestamp: new Date().toISOString(),
    })
    expect(asyncFn).not.toHaveBeenCalled()
  })

  it('respects cooldown and does not fire within cooldown window', async () => {
    registerReflex({
      name: 'cooldown-test',
      description: '',
      priority: 1,
      cooldownMs: 5000,
      autoStart: true,
      match: () => true,
      action: asyncFn,
    })
    startReactEngine()
    ingestSignal({
      id: 'cd-1',
      eyeId: 'eye-1',
      eyeType: 'camera',
      type: 'motion',
      confidence: 0.8,
      summary: 'first',
      timestamp: new Date().toISOString(),
    })
    ingestSignal({
      id: 'cd-2',
      eyeId: 'eye-1',
      eyeType: 'camera',
      type: 'motion',
      confidence: 0.8,
      summary: 'second',
      timestamp: new Date().toISOString(),
    })
    // First should fire, second should be throttled
    expect(asyncFn).toHaveBeenCalledTimes(1)
  })

  it('fires again after cooldown expires', async () => {
    registerReflex({
      name: 'cooldown-expire-test',
      description: '',
      priority: 1,
      cooldownMs: 50,
      autoStart: true,
      match: () => true,
      action: asyncFn,
    })
    startReactEngine()
    ingestSignal({ id: 'a', eyeId: 'e1', eyeType: 'camera', type: 'motion', confidence: 0.5, summary: 'a', timestamp: new Date().toISOString() })
    await new Promise((r) => setTimeout(r, 60))
    ingestSignal({ id: 'b', eyeId: 'e1', eyeType: 'camera', type: 'motion', confidence: 0.5, summary: 'b', timestamp: new Date().toISOString() })
    expect(asyncFn).toHaveBeenCalledTimes(2)
  })

  it('fires matching reflex even when other reflexes do not match', () => {
    const noMatch = vi.fn().mockResolvedValue(undefined)
    registerReflex({ name: 'match', description: '', priority: 1, cooldownMs: 0, autoStart: true, match: () => true, action: asyncFn })
    registerReflex({ name: 'no-match', description: '', priority: 1, cooldownMs: 0, autoStart: true, match: () => false, action: noMatch })
    startReactEngine()
    ingestSignal({ id: 'multi', eyeId: 'e1', eyeType: 'camera', type: 'test', confidence: 0.5, summary: 'multi', timestamp: new Date().toISOString() })
    expect(asyncFn).toHaveBeenCalled()
    expect(noMatch).not.toHaveBeenCalled()
  })
})

describe('engine lifecycle', () => {
  it('starts and stops', () => {
    expect(reactStatus().running).toBe(false)
    startReactEngine()
    expect(reactStatus().running).toBe(true)
    stopReactEngine()
    expect(reactStatus().running).toBe(false)
  })

  it('is idempotent on multiple starts', () => {
    startReactEngine()
    startReactEngine()
    expect(reactStatus().running).toBe(true)
  })

  it('reports reflex count in status', () => {
    registerReflex({ name: 'status-test', description: '', priority: 1, cooldownMs: 100, autoStart: true, match: () => false, action: noop })
    startReactEngine()
    const status = reactStatus()
    expect(status.reflexCount).toBeGreaterThanOrEqual(1)
    expect(status.reflexes.find((r) => r.name === 'status-test')).toBeDefined()
  })
})
