import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/store', () => ({
  appendLog: vi.fn(),
  getSettings: vi.fn(() => ({
    boloVisionModel: '',
    ollamaModel: 'llava',
    ollamaUrl: 'http://127.0.0.1:11434',
  })),
}))

vi.mock('@/lib/messageLog', () => ({ logSignal: vi.fn() }))
vi.mock('@/lib/react-engine', () => ({ ingestSignal: vi.fn() }))

import {
  registerProducer,
  registerEye,
  unregisterEye,
  getEye,
  listEyes,
  activeWitnesses,
  startEye,
  stopEye,
  startAllEyes,
  stopAllEyes,
  startEngine,
  stopEngine,
  isEngineRunning,
  engineStatus,
} from '@/lib/witness-engine'

beforeEach(() => {
  stopEngine()
  // Clear the global engine state
  if ((globalThis as any).__witnessEngine) {
    ;(globalThis as any).__witnessEngine.eyes.clear()
    ;(globalThis as any).__witnessEngine.timers.clear()
    ;(globalThis as any).__witnessEngine.subscribers.clear()
    ;(globalThis as any).__witnessEngine.running = false
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('eye registration', () => {
  it('registers an eye and retrieves it', () => {
    registerEye({
      id: 'cam-1',
      type: 'camera',
      label: 'Front Door Camera',
      enabled: true,
      intervalMs: 5000,
      location: 'front door',
    })
    const eye = getEye('cam-1')
    expect(eye).toBeDefined()
    expect(eye!.config.label).toBe('Front Door Camera')
    expect(eye!.config.location).toBe('front door')
  })

  it('lists all registered eyes', () => {
    registerEye({ id: 'e1', type: 'camera', label: 'One', enabled: true, intervalMs: 1000 })
    registerEye({ id: 'e2', type: 'file_watch', label: 'Two', enabled: true, intervalMs: 2000 })
    const eyes = listEyes()
    expect(eyes).toHaveLength(2)
  })

  it('unregisters an eye', () => {
    registerEye({ id: 'temp', type: 'camera', label: 'Temp', enabled: true, intervalMs: 1000 })
    expect(listEyes()).toHaveLength(1)
    unregisterEye('temp')
    expect(listEyes()).toHaveLength(0)
  })

  it('getEye returns undefined for unknown eye', () => {
    expect(getEye('nonexistent')).toBeUndefined()
  })
})

describe('activeWitnesses', () => {
  it('returns empty array when no eyes registered', () => {
    expect(activeWitnesses()).toEqual([])
  })

  it('returns catalog entries with correct capabilities', () => {
    registerEye({ id: 'cam-main', type: 'camera', label: 'Main Cam', enabled: true, intervalMs: 5000 })
    registerEye({ id: 'fw-dl', type: 'file_watch', label: 'Downloads', enabled: true, intervalMs: 3000 })
    registerEye({ id: 'sh-sys', type: 'system_health', label: 'System', enabled: true, intervalMs: 10000 })

    const witnesses = activeWitnesses()
    expect(witnesses).toHaveLength(3)

    const cam = witnesses.find((w) => w.id === 'cam-main')
    expect(cam!.capability).toBe('motion_detect')

    const fw = witnesses.find((w) => w.id === 'fw-dl')
    expect(fw!.capability).toBe('file_arrival')

    const sh = witnesses.find((w) => w.id === 'sh-sys')
    expect(sh!.capability).toBe('system_telemetry')
  })

  it('includes location when set', () => {
    registerEye({ id: 'cam-loc', type: 'camera', label: 'Located', enabled: true, intervalMs: 5000, location: 'garage' })
    const witnesses = activeWitnesses()
    expect(witnesses[0].location).toBe('garage')
  })

  it('marks unknown eye types as custom_witness', () => {
    registerEye({ id: 'custom', type: 'custom', label: 'Custom', enabled: true, intervalMs: 5000 })
    const witnesses = activeWitnesses()
    expect(witnesses[0].capability).toBe('custom_witness')
  })
})

describe('eye lifecycle', () => {
  it('startEye returns false for unregistered eye', () => {
    expect(startEye('nonexistent')).toBe(false)
  })

  it('stopEye returns false for unregistered eye', () => {
    expect(stopEye('nonexistent')).toBe(false)
  })

  it('startEye returns false when no producer registered', () => {
    registerEye({ id: 'orphan', type: 'camera', label: 'No Producer', enabled: true, intervalMs: 1000 })
    expect(startEye('orphan')).toBe(false)
  })

  it('startEye succeeds when a producer is registered', () => {
    registerProducer('camera', async () => null)
    registerEye({ id: 'produced', type: 'camera', label: 'Has Producer', enabled: true, intervalMs: 5000 })
    expect(startEye('produced')).toBe(true)
  })
})

describe('engine lifecycle', () => {
  it('is not running initially', () => {
    expect(isEngineRunning()).toBe(false)
  })

  it('starts and stops', () => {
    startEngine()
    expect(isEngineRunning()).toBe(true)
    stopEngine()
    expect(isEngineRunning()).toBe(false)
  })

  it('is idempotent on multiple start calls', () => {
    startEngine()
    startEngine()
    expect(isEngineRunning()).toBe(true)
  })

  it('engineStatus reports correct count', () => {
    registerEye({ id: 'eye-a', type: 'camera', label: 'A', enabled: true, intervalMs: 1000 })
    registerEye({ id: 'eye-b', type: 'file_watch', label: 'B', enabled: true, intervalMs: 2000 })
    const status = engineStatus()
    expect(status.eyeCount).toBe(2)
    expect(status.running).toBe(false)
  })

  it('startAllEyes requires producers', () => {
    registerEye({ id: 'no-prod', type: 'camera', label: 'No Producer', enabled: true, intervalMs: 1000 })
    // Should not throw
    expect(() => startAllEyes()).not.toThrow()
  })
})
