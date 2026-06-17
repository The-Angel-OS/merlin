/**
 * Nimue — UI helper function unit tests
 *
 * Tests utility functions used across the UI:
 * - fmtUptime (dashboard stat card)
 * - resolveCrumb (AppHeader breadcrumb)
 * - Camera protocol handling helpers
 */
import { describe, it, expect } from 'vitest'

// ── fmtUptime ────────────────────────────────────────────────────────────────
// Mirrored from src/app/page.tsx

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

describe('fmtUptime', () => {
  it('returns minutes for < 1 hour', () => {
    expect(fmtUptime(0)).toBe('0m')
    expect(fmtUptime(60)).toBe('1m')
    expect(fmtUptime(3540)).toBe('59m')
  })

  it('returns hours and minutes for 1h–23h', () => {
    expect(fmtUptime(3600)).toBe('1h 0m')
    expect(fmtUptime(7380)).toBe('2h 3m')
    expect(fmtUptime(82800)).toBe('23h 0m')
  })

  it('returns days and hours for >= 1 day', () => {
    expect(fmtUptime(86400)).toBe('1d 0h')
    expect(fmtUptime(90000)).toBe('1d 1h')
    expect(fmtUptime(172800)).toBe('2d 0h')
    expect(fmtUptime(604800)).toBe('7d 0h')
  })

  it('days take precedence over hours and minutes', () => {
    // 1d 2h 3m
    const s = 86400 + 7200 + 180
    expect(fmtUptime(s)).toBe('1d 2h')
  })

  it('handles large uptime (30 days)', () => {
    expect(fmtUptime(30 * 86400)).toBe('30d 0h')
  })
})

// ── resolveCrumb ─────────────────────────────────────────────────────────────
// Mirrored from src/components/AppHeader.tsx

type Crumb = { label: string; color: string; parent?: string; parentColor?: string }

const CRUMBS: Record<string, Crumb> = {
  '/':                   { label: 'Dashboard',      color: '#f5a623' },
  '/cic':                { label: 'CIC',             color: '#f5a623', parent: 'Bridge' },
  '/log':                { label: 'Activity Log',    color: '#f5a623', parent: 'Bridge' },
  '/content/pages':      { label: 'Pages',           color: '#99ccff', parent: 'Content' },
  '/content/posts':      { label: 'Posts',           color: '#99ccff', parent: 'Content' },
  '/content/products':   { label: 'Products',        color: '#22cc88', parent: 'Content' },
  '/content/events':     { label: 'Events',          color: '#99ccff', parent: 'Content' },
  '/media':              { label: 'Media',            color: '#99ccff', parent: 'Content' },
  '/cameras':            { label: 'Cameras',          color: '#cc4444', parent: 'Surveillance' },
  '/leo':                { label: 'LEO — AI',         color: '#cc99cc', parent: 'Communication' },
  '/spaces':             { label: 'Spaces',           color: '#cc99cc', parent: 'Communication' },
  '/infra/docker':       { label: 'Docker',           color: '#9977aa', parent: 'Infrastructure' },
  '/infra/kubernetes':   { label: 'Kubernetes',       color: '#9977aa', parent: 'Infrastructure' },
  '/infra/vmware':       { label: 'VMware',           color: '#9977aa', parent: 'Infrastructure' },
  '/learn':              { label: 'System Guide',     color: '#99ccff', parent: 'Library' },
  '/keys':               { label: 'Keys & Config',    color: '#7788aa', parent: 'System' },
}

function resolveCrumb(pathname: string): Crumb | undefined {
  return Object.entries(CRUMBS)
    .filter(([path]) => pathname === path || pathname.startsWith(path + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1]
}

describe('resolveCrumb', () => {
  describe('exact matches', () => {
    it('resolves / to Dashboard', () => {
      const c = resolveCrumb('/')
      expect(c?.label).toBe('Dashboard')
      expect(c?.color).toBe('#f5a623')
      expect(c?.parent).toBeUndefined()
    })

    it('resolves /leo to LEO — AI', () => {
      const c = resolveCrumb('/leo')
      expect(c?.label).toBe('LEO — AI')
      expect(c?.parent).toBe('Communication')
    })

    it('resolves /cameras to Cameras', () => {
      const c = resolveCrumb('/cameras')
      expect(c?.label).toBe('Cameras')
      expect(c?.color).toBe('#cc4444')
      expect(c?.parent).toBe('Surveillance')
    })

    it('resolves /learn to System Guide', () => {
      const c = resolveCrumb('/learn')
      expect(c?.label).toBe('System Guide')
      expect(c?.parent).toBe('Library')
    })
  })

  describe('nested path matching', () => {
    it('resolves /content/posts to Posts', () => {
      const c = resolveCrumb('/content/posts')
      expect(c?.label).toBe('Posts')
      expect(c?.parent).toBe('Content')
    })

    it('resolves /content/posts/123 to Posts (sub-path)', () => {
      const c = resolveCrumb('/content/posts/123')
      expect(c?.label).toBe('Posts')
    })

    it('resolves /content/products to Products', () => {
      const c = resolveCrumb('/content/products')
      expect(c?.label).toBe('Products')
      expect(c?.color).toBe('#22cc88')
    })

    it('resolves /infra/docker to Docker', () => {
      const c = resolveCrumb('/infra/docker')
      expect(c?.label).toBe('Docker')
      expect(c?.parent).toBe('Infrastructure')
    })

    it('picks longest match over shorter prefix', () => {
      // /content/products should NOT match as /content (if that existed)
      const c = resolveCrumb('/content/products')
      expect(c?.label).toBe('Products')
    })
  })

  describe('unrecognised paths', () => {
    it('returns undefined for unknown route', () => {
      expect(resolveCrumb('/unknown-route')).toBeUndefined()
    })

    it('returns undefined for empty string', () => {
      // The '/' entry requires exact match or startsWith('/')
      // An empty string won't match '/' exactly
      expect(resolveCrumb('')).toBeUndefined()
    })
  })
})

// ── Camera protocol validation ────────────────────────────────────────────────

describe('camera protocol helpers', () => {
  type Protocol = 'mjpeg' | 'hls' | 'rtsp'

  const isStreamable = (protocol: Protocol, snapshotUrl?: string): boolean => {
    if (protocol === 'mjpeg') return true
    if (protocol === 'hls') return true
    if (protocol === 'rtsp') return !!snapshotUrl
    return false
  }

  const getStreamPath = (cameraId: string, protocol: Protocol): string => {
    if (protocol === 'mjpeg') return `/api/cameras/${cameraId}/stream`
    if (protocol === 'hls') return `/api/cameras/${cameraId}/hls/index.m3u8`
    return `/api/cameras/${cameraId}/stream`
  }

  it('mjpeg is always streamable', () => {
    expect(isStreamable('mjpeg')).toBe(true)
  })

  it('hls is always streamable', () => {
    expect(isStreamable('hls')).toBe(true)
  })

  it('rtsp is only streamable with snapshotUrl', () => {
    expect(isStreamable('rtsp', 'http://cam1/snapshot')).toBe(true)
    expect(isStreamable('rtsp', undefined)).toBe(false)
  })

  it('mjpeg stream path uses /api/cameras/[id]/stream', () => {
    expect(getStreamPath('cam-1', 'mjpeg')).toBe('/api/cameras/cam-1/stream')
  })

  it('hls stream path uses index.m3u8', () => {
    expect(getStreamPath('cam-2', 'hls')).toBe('/api/cameras/cam-2/hls/index.m3u8')
  })
})
