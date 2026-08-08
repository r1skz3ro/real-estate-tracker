import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: everything tested here is server-side
// (parsers, diff engine), so tests run without the TanStack Start / React plugins.
export default defineConfig({
  // Same native tsconfig `paths` resolution vite.config.ts uses, so `@/…` resolves in tests too.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
