import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/**',
        'src/components/**',
        'src/app/api/**',
      ],
      exclude: ['**/*.d.ts', '**/payload-types.ts', '**/node_modules/**'],
    },
    testTimeout: 10_000,
  },
})
