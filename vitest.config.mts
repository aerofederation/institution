import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.ts',
      'tests/rls/**/*.test.ts',
    ],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      // See tests/stubs/server-only.ts for why this is aliased.
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
})
