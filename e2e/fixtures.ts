import { test as base, expect } from '@playwright/test'

// Auth-gated tests read these; if unset, the test skips itself rather than
// failing — keeps `npm run e2e` green with zero setup, while still running
// the full authenticated suite wherever credentials are configured.
export const E2E_EMAIL = process.env.E2E_TEST_EMAIL
export const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD
export const hasTestAccount = Boolean(E2E_EMAIL && E2E_PASSWORD)

export async function login(page: import('@playwright/test').Page) {
  if (!E2E_EMAIL || !E2E_PASSWORD) {
    throw new Error('login() called without E2E_TEST_EMAIL/E2E_TEST_PASSWORD set')
  }
  await page.goto('/login')
  await page.getByPlaceholder('you@company.com').fill(E2E_EMAIL)
  await page.getByPlaceholder('••••••••').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 })
}

export const test = base
export { expect }
