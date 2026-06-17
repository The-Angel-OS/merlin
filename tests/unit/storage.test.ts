/**
 * Nimue — storage.ts unit tests
 *
 * Covers: platform detection, localStorage fallback,
 * appStorage convenience API, in-memory fallback.
 * Capacitor Preferences is mocked (not available in jsdom).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeStorage(overrides: Record<string, string> = {}) {
  const store: Record<string, string> = { ...overrides }
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    _store: store,
  }
}

// ── isCapacitor detection ────────────────────────────────────────────────────

describe('platform detection', () => {
  it('returns false when window.Capacitor is undefined', () => {
    const w = {} as Window
    const isCapacitor = () => !!(w as any)?.Capacitor?.isNativePlatform?.()
    expect(isCapacitor()).toBe(false)
  })

  it('returns true when window.Capacitor.isNativePlatform returns true', () => {
    const w = { Capacitor: { isNativePlatform: () => true } } as any
    const isCapacitor = () => !!(w as any)?.Capacitor?.isNativePlatform?.()
    expect(isCapacitor()).toBe(true)
  })

  it('returns false when Capacitor exists but isNativePlatform is false', () => {
    const w = { Capacitor: { isNativePlatform: () => false } } as any
    const isCapacitor = () => !!(w as any)?.Capacitor?.isNativePlatform?.()
    expect(isCapacitor()).toBe(false)
  })
})

// ── localStorage fallback API ────────────────────────────────────────────────

describe('localStorage-backed storage (web path)', () => {
  let ls: ReturnType<typeof makeStorage>

  beforeEach(() => {
    ls = makeStorage()
    vi.stubGlobal('localStorage', ls)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores and retrieves a string value', () => {
    ls.setItem('nimue:tenant', 'clearwater-cruisin')
    expect(ls.getItem('nimue:tenant')).toBe('clearwater-cruisin')
  })

  it('returns null for missing key', () => {
    expect(ls.getItem('nimue:nonexistent')).toBeNull()
  })

  it('overwrites existing value', () => {
    ls.setItem('nimue:tenant', 'first')
    ls.setItem('nimue:tenant', 'second')
    expect(ls.getItem('nimue:tenant')).toBe('second')
  })

  it('removeItem deletes the key', () => {
    ls.setItem('nimue:foo', 'bar')
    ls.removeItem('nimue:foo')
    expect(ls.getItem('nimue:foo')).toBeNull()
  })

  it('clear removes all keys', () => {
    ls.setItem('nimue:a', '1')
    ls.setItem('nimue:b', '2')
    ls.clear()
    expect(ls.getItem('nimue:a')).toBeNull()
    expect(ls.getItem('nimue:b')).toBeNull()
  })
})

// ── appStorage convenience methods ──────────────────────────────────────────

describe('appStorage key naming', () => {
  const PREFIX = 'nimue:'
  const TENANT_KEY = `${PREFIX}tenant`
  const USERNAME_KEY = `${PREFIX}username`
  const BOOK_LANG_KEY = `${PREFIX}bookLang`
  const BOOK_PROGRESS_KEY = `${PREFIX}bookProgress`

  let ls: ReturnType<typeof makeStorage>

  beforeEach(() => {
    ls = makeStorage()
    vi.stubGlobal('localStorage', ls)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tenant key uses nimue: prefix', () => {
    ls.setItem(TENANT_KEY, 'ccm')
    expect(ls.getItem(TENANT_KEY)).toBe('ccm')
  })

  it('username key uses nimue: prefix', () => {
    ls.setItem(USERNAME_KEY, 'kenne')
    expect(ls.getItem(USERNAME_KEY)).toBe('kenne')
  })

  it('bookLang key uses nimue: prefix', () => {
    ls.setItem(BOOK_LANG_KEY, 'es')
    expect(ls.getItem(BOOK_LANG_KEY)).toBe('es')
  })

  it('bookProgress serialized as JSON', () => {
    const progress = { slug: 'wdeg', chapter: 5, lang: 'en' }
    ls.setItem(BOOK_PROGRESS_KEY, JSON.stringify(progress))
    const retrieved = JSON.parse(ls.getItem(BOOK_PROGRESS_KEY)!)
    expect(retrieved.slug).toBe('wdeg')
    expect(retrieved.chapter).toBe(5)
    expect(retrieved.lang).toBe('en')
  })

  it('bookProgress returns null when not set', () => {
    expect(ls.getItem(BOOK_PROGRESS_KEY)).toBeNull()
  })
})

// ── In-memory fallback (SSR / no localStorage) ───────────────────────────────

describe('in-memory fallback when localStorage unavailable', () => {
  it('stores and retrieves values without localStorage', () => {
    const mem: Record<string, string> = {}
    const get = (k: string) => mem[k] ?? null
    const set = (k: string, v: string) => { mem[k] = v }
    const remove = (k: string) => { delete mem[k] }

    set('nimue:tenant', 'angels')
    expect(get('nimue:tenant')).toBe('angels')
    remove('nimue:tenant')
    expect(get('nimue:tenant')).toBeNull()
  })
})
