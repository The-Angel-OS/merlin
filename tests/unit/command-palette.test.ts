/**
 * Nimue — CommandPalette fuzzy search unit tests
 *
 * The fuzzy() function is extracted and tested in isolation.
 * Tests cover: empty query, partial match, case insensitive,
 * sub-label match, no match, and sorted order.
 */
import { describe, it, expect } from 'vitest'

// ── Replicating the fuzzy logic from CommandPalette.tsx ──────────────────────

interface Item {
  id: string
  label: string
  sub?: string
}

function fuzzy(query: string, items: Item[]): Item[] {
  if (!query.trim()) return items
  const q = query.toLowerCase()
  return items.filter(item =>
    item.label.toLowerCase().includes(q) ||
    item.sub?.toLowerCase().includes(q) ||
    item.id.toLowerCase().includes(q),
  )
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ITEMS: Item[] = [
  { id: 'dashboard',   label: 'Dashboard',        sub: 'Bridge' },
  { id: 'cic',         label: 'CIC',              sub: 'Bridge' },
  { id: 'posts',       label: 'Posts',            sub: 'Content' },
  { id: 'products',    label: 'Products',         sub: 'Content' },
  { id: 'cameras',     label: 'Cameras',          sub: 'Surveillance' },
  { id: 'leo',         label: 'LEO — AI',         sub: 'Communication' },
  { id: 'spaces',      label: 'Spaces',           sub: 'Communication' },
  { id: 'docker',      label: 'Docker',           sub: 'Infrastructure' },
  { id: 'books',       label: 'Books',            sub: 'Library' },
  { id: 'keys',        label: 'Keys & Config',    sub: 'System' },
]

// ── Tests ────────────────────────────────────────────────────────────────────

describe('fuzzy search', () => {
  describe('empty / blank queries', () => {
    it('returns all items for empty string', () => {
      expect(fuzzy('', ITEMS)).toHaveLength(ITEMS.length)
    })

    it('returns all items for whitespace-only query', () => {
      expect(fuzzy('   ', ITEMS)).toHaveLength(ITEMS.length)
    })
  })

  describe('label matching', () => {
    it('matches by exact label (case-insensitive)', () => {
      const results = fuzzy('dashboard', ITEMS)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('dashboard')
    })

    it('matches by uppercase label', () => {
      const results = fuzzy('CAMERAS', ITEMS)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('cameras')
    })

    it('matches by partial label prefix', () => {
      const results = fuzzy('prod', ITEMS)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('products')
    })

    it('matches by partial label substring', () => {
      const results = fuzzy('onfig', ITEMS)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('keys')
    })

    it('matches multiple items sharing a label fragment', () => {
      // 'Posts' contains 'st', 'Spaces' contains 'sp' — use 'p' for both Posts/Products/Spaces
      // 'Posts' = 'po', 'Products' = 'pr' — use 'p' not 'po'
      const results = fuzzy('p', ITEMS)
      const ids = results.map(r => r.id)
      expect(ids).toContain('posts')
      expect(ids).toContain('products')
      expect(ids.length).toBeGreaterThan(1)
    })
  })

  describe('sub-label matching', () => {
    it('matches items by section name', () => {
      const results = fuzzy('bridge', ITEMS)
      expect(results.map(r => r.id)).toContain('dashboard')
      expect(results.map(r => r.id)).toContain('cic')
    })

    it('matches all Content section items', () => {
      const results = fuzzy('content', ITEMS)
      expect(results.map(r => r.id)).toContain('posts')
      expect(results.map(r => r.id)).toContain('products')
      expect(results.map(r => r.id)).not.toContain('cameras')
    })

    it('matches Communication section items', () => {
      const results = fuzzy('communication', ITEMS)
      expect(results.map(r => r.id)).toContain('leo')
      expect(results.map(r => r.id)).toContain('spaces')
    })
  })

  describe('id matching', () => {
    it('matches by id substring', () => {
      const results = fuzzy('doc', ITEMS)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('docker')
    })

    it('matches LEO by id', () => {
      const results = fuzzy('leo', ITEMS)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('leo')
    })
  })

  describe('no match', () => {
    it('returns empty array for no match', () => {
      expect(fuzzy('xyzzy', ITEMS)).toHaveLength(0)
    })

    it('returns empty array for numeric-only query not in data', () => {
      expect(fuzzy('9999', ITEMS)).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('handles items with no sub property', () => {
      const items: Item[] = [
        { id: 'bare', label: 'Bare Item' },
      ]
      const results = fuzzy('infra', items) // won't match label or id
      expect(results).toHaveLength(0)
    })

    it('handles special characters in query gracefully', () => {
      expect(() => fuzzy('&', ITEMS)).not.toThrow()
    })

    it('preserves original order of matching items', () => {
      const results = fuzzy('s', ITEMS)
      // 'spaces', 'cameras', 'posts', 'keys', 'books' all contain 's'
      // They should appear in their original array order
      const ids = results.map(r => r.id)
      const postsIdx = ids.indexOf('posts')
      const spacesIdx = ids.indexOf('spaces')
      expect(postsIdx).toBeLessThan(spacesIdx)
    })
  })
})
