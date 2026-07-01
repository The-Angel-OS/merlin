import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/store', () => ({
  appendLog: vi.fn(),
  getSettings: vi.fn(() => ({
    boloVisionModel: '',
    ollamaModel: 'llava',
    ollamaUrl: 'http://127.0.0.1:11434',
  })),
}))

import {
  buildBoloSystemPrompt,
  buildBoloUserPrompt,
  validateAnalysis,
  logBoloAudit,
  CONSTITUTION_ABRIDGED,
  YIN_YANG_CONDUCT,
} from '@/lib/guardian-conduct'

describe('buildBoloSystemPrompt', () => {
  it('includes the Constitution abridged text', () => {
    const prompt = buildBoloSystemPrompt()
    expect(prompt).toContain('Article I')
    expect(prompt).toContain('Dignity')
  })

  it('includes the Yin Yang Rules of Conduct', () => {
    const prompt = buildBoloSystemPrompt()
    expect(prompt).toContain('YANG')
    expect(prompt).toContain('YIN')
    expect(prompt).toContain('BALANCE')
  })

  it('includes a JSON schema for the response structure', () => {
    const prompt = buildBoloSystemPrompt()
    expect(prompt).toContain('"scene"')
    expect(prompt).toContain('"boloPriority"')
    expect(prompt).toContain('"yinYangBalance"')
  })
})

describe('buildBoloUserPrompt', () => {
  it('asks for BOLO analysis in JSON only', () => {
    const prompt = buildBoloUserPrompt()
    expect(prompt).toContain('BOLO')
    expect(prompt).toContain('JSON')
  })
})

describe('validateAnalysis', () => {
  it('parses valid BOLO analysis JSON', () => {
    const raw = JSON.stringify({
      scene: 'Empty parking lot at night',
      objects: ['car', 'streetlight'],
      people: 0,
      vehicles: 1,
      boloFlags: [],
      boloPriority: 'none',
      boloRationale: '',
      confidence: 0.95,
      yinYangBalance: 'privacy',
    })
    const result = validateAnalysis(raw)
    expect(result).not.toBeNull()
    expect(result!.scene).toBe('Empty parking lot at night')
    expect(result!.people).toBe(0)
    expect(result!.boloPriority).toBe('none')
    expect(result!.confidence).toBeCloseTo(0.95)
  })

  it('handles critical threat analysis', () => {
    const raw = JSON.stringify({
      scene: 'Person brandishing weapon',
      objects: ['person', 'knife', 'table'],
      people: 1,
      vehicles: 0,
      boloFlags: ['active weapon visible'],
      boloPriority: 'critical',
      boloRationale: 'Person holding a knife in raised position',
      confidence: 0.88,
      yinYangBalance: 'safety',
    })
    const result = validateAnalysis(raw)
    expect(result).not.toBeNull()
    expect(result!.boloFlags).toContain('active weapon visible')
    expect(result!.boloPriority).toBe('critical')
    expect(result!.yinYangBalance).toBe('safety')
  })

  it('normalizes missing optional fields', () => {
    const raw = JSON.stringify({ scene: 'Test' })
    const result = validateAnalysis(raw)
    expect(result).not.toBeNull()
    expect(result!.objects).toEqual([])
    expect(result!.people).toBe(0)
    expect(result!.boloPriority).toBe('none')
    expect(result!.yinYangBalance).toBe('privacy')
    expect(result!.confidence).toBe(0)
  })

  it('returns null on completely invalid JSON', () => {
    expect(validateAnalysis('not json')).toBeNull()
  })

  it('returns null on null input', () => {
    expect(validateAnalysis('null')).toBeNull()
  })

  it('returns null when scene is missing', () => {
    expect(validateAnalysis(JSON.stringify({ objects: [] }))).toBeNull()
  })

  it('coerces invalid boloPriority to none', () => {
    const raw = JSON.stringify({
      scene: 'Test',
      boloPriority: 'extreme',
    })
    const result = validateAnalysis(raw)
    expect(result).not.toBeNull()
    expect(result!.boloPriority).toBe('none')
  })

  it('coerces invalid yinYangBalance to privacy', () => {
    const raw = JSON.stringify({
      scene: 'Test',
      yinYangBalance: 'invalid',
    })
    const result = validateAnalysis(raw)
    expect(result).not.toBeNull()
    expect(result!.yinYangBalance).toBe('privacy')
  })
})

describe('logBoloAudit', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('handles none priority without throwing', () => {
    const analysis = {
      scene: 'Empty hallway',
      objects: [],
      people: 0,
      vehicles: 0,
      boloFlags: [],
      boloPriority: 'none' as const,
      boloRationale: '',
      confidence: 0.5,
      yinYangBalance: 'privacy' as const,
    }
    expect(() => logBoloAudit(analysis, 'camera:hallway')).not.toThrow()
  })

  it('logs at warning level for medium priority', () => {
    const analysis = {
      scene: 'Suspicious vehicle',
      objects: ['car'],
      people: 0,
      vehicles: 1,
      boloFlags: ['unattended package'],
      boloPriority: 'medium' as const,
      boloRationale: 'Package left near entrance',
      confidence: 0.7,
      yinYangBalance: 'escalate' as const,
    }
    expect(() => logBoloAudit(analysis, 'camera:front-door')).not.toThrow()
  })

  it('logs at incident level for critical priority', () => {
    const analysis = {
      scene: 'Fire',
      objects: ['flames'],
      people: 0,
      vehicles: 0,
      boloFlags: ['fire visible'],
      boloPriority: 'critical' as const,
      boloRationale: 'Active flames visible in frame',
      confidence: 0.99,
      yinYangBalance: 'safety' as const,
    }
    expect(() => logBoloAudit(analysis, 'camera:backyard')).not.toThrow()
  })

  it('does not throw on low priority', () => {
    const analysis = {
      scene: 'Empty room',
      objects: ['chair', 'desk'],
      people: 0,
      vehicles: 0,
      boloFlags: [],
      boloPriority: 'low' as const,
      boloRationale: '',
      confidence: 0.5,
      yinYangBalance: 'privacy' as const,
    }
    expect(() => logBoloAudit(analysis, 'camera:office')).not.toThrow()
  })
})
