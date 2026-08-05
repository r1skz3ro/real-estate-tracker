import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: everything tested here is server-side
// (parsers, diff engine), so tests run without the TanStack Start / React plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
