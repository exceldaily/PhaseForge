import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Vitest owns unit tests under src/**; Playwright owns e2e/** (separate
// runner, separate `test`/`expect` API) — excluded here so `npm test` never
// tries to execute Playwright specs.
export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" so units that import app modules test as-is.
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // The real package throws outside React Server Components, which would
      // make server-only libs untestable; tests get a no-op.
      'server-only': path.resolve(__dirname, 'src/lib/testing/server-only-stub.ts'),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**'],
  },
})
