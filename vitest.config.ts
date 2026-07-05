import { defineConfig } from 'vitest/config'

// Vitest owns unit tests under src/**; Playwright owns e2e/** (separate
// runner, separate `test`/`expect` API) — excluded here so `npm test` never
// tries to execute Playwright specs.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**'],
  },
})
