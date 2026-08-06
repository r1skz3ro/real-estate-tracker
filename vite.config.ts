import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // The client dep scan crawls route → server fn → fetch/browser → playwright, whose optional
  // fsevents ships a native .node the optimizer chokes on. Server-only; never bundled anyway.
  optimizeDeps: { exclude: ['playwright'] },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
