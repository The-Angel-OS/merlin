/**
 * Cross-platform storage utility
 * Works in: Web browser, PWA (installed), Capacitor iOS/Android
 *
 * Priority:
 *   1. Capacitor Preferences plugin (iOS Keychain / Android SharedPreferences)
 *   2. localStorage (Web / PWA)
 *   3. In-memory fallback (SSR)
 *
 * Usage:
 *   await storage.set('key', value)
 *   const v = await storage.get<string>('key')
 *   await storage.remove('key')
 */

type StorageValue = string | number | boolean | object | null

const memoryFallback = new Map<string, string>()

function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { Capacitor?: { isNative?: boolean } }).Capacitor?.isNative
}

async function getCapacitorPreferences() {
  if (!isCapacitor()) return null
  try {
    // Obfuscate module specifier so webpack doesn't try to resolve it at build time
    // (package is only installed inside Capacitor runtime)
    const mod = await import(/* webpackIgnore: true */ '@capacitor' + '/preferences').catch(() => null)
    return mod?.Preferences ?? null
  } catch {
    return null
  }
}

export const storage = {
  async set(key: string, value: StorageValue): Promise<void> {
    const serialized = JSON.stringify(value)
    const prefs = await getCapacitorPreferences()
    if (prefs) {
      await prefs.set({ key, value: serialized })
      return
    }
    try {
      localStorage.setItem(key, serialized)
    } catch {
      memoryFallback.set(key, serialized)
    }
  },

  async get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined> {
    const prefs = await getCapacitorPreferences()
    let raw: string | null = null

    if (prefs) {
      const result = await prefs.get({ key })
      raw = result.value
    } else {
      try {
        raw = localStorage.getItem(key)
      } catch {
        raw = memoryFallback.get(key) ?? null
      }
    }

    if (raw === null) return defaultValue
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  },

  async remove(key: string): Promise<void> {
    const prefs = await getCapacitorPreferences()
    if (prefs) {
      await prefs.remove({ key })
      return
    }
    try {
      localStorage.removeItem(key)
    } catch {
      memoryFallback.delete(key)
    }
  },

  // Synchronous get for use in components during SSR-safe render
  // Falls back to localStorage only (Capacitor async gets must use the async version)
  getSync<T = unknown>(key: string, defaultValue?: T): T | undefined {
    if (typeof window === 'undefined') return defaultValue
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return defaultValue
      return JSON.parse(raw) as T
    } catch {
      return defaultValue
    }
  },
}

// ─── Typed accessors for common values ───────────────────────────────────────

export const appStorage = {
  getTenant: () => storage.getSync<string>('nimue-tenant'),
  setTenant: (slug: string) => storage.set('nimue-tenant', slug),

  getUsername: () => storage.getSync<string>('nimue-username', 'Captain'),
  setUsername: (name: string) => storage.set('nimue-username', name),

  getBookLang: (slug: string) => storage.getSync<string>(`book-lang-${slug}`, 'en'),
  setBookLang: (slug: string, lang: string) => storage.set(`book-lang-${slug}`, lang),

  getBookProgress: (slug: string) => storage.getSync<number>(`book-progress-${slug}`, 1),
  setBookProgress: (slug: string, chapter: number) => storage.set(`book-progress-${slug}`, chapter),

  getSettings: () => storage.getSync<Record<string, unknown>>('nimue-settings', {}),
  setSettings: (s: Record<string, unknown>) => storage.set('nimue-settings', s),
}
