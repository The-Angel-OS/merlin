import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

// Polyfill crypto.subtle for environments that don't expose it in jsdom
// (vitest + node 20 has it natively, but guard for older CI images).
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

// Polyfill localStorage for jsdom
if (typeof window !== 'undefined' && !window.localStorage) {
  const store: Record<string, string> = {}
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    },
  })
}
