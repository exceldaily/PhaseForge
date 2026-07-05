import { test, expect } from './fixtures'

// These run with zero configuration — no test account needed — and cover
// the highest-risk auth surface: protected routes must never render for a
// signed-out visitor, regardless of which URL they hit.

test.describe('Protected routes', () => {
  const protectedPaths = [
    '/app/dashboard',
    '/app/projects',
    '/app/calls',
    '/app/customers',
    '/app/staff',
    '/app/vendors',
    '/app/invoices',
    '/app/files',
    '/app/settings',
    '/app/settings/modules',
  ]

  for (const path of protectedPaths) {
    test(`redirects signed-out visitor away from ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/)
    })
  }

  test('redirects a made-up nested app URL to login, not a crash', async ({ page }) => {
    await page.goto('/app/projects/00000000-0000-0000-0000-000000000000')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Login page', () => {
  test('renders the sign-in form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByPlaceholder('you@company.com')).toBeVisible()
    await expect(page.getByPlaceholder('••••••••')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('shows a friendly error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('you@company.com').fill('nonexistent-qa-user@example.com')
    await page.getByPlaceholder('••••••••').fill('wrong-password-123')
    await page.getByRole('button', { name: /sign in/i }).click()
    // Must show SOME error text, not a blank page or unhandled exception
    await expect(page.getByText(/invalid|incorrect|not found|error/i)).toBeVisible({ timeout: 10_000 })
    // And must not have navigated into the app
    await expect(page).toHaveURL(/\/login/)
  })

  test('rejects empty submission via native required-field validation', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in/i }).click()
    // Browser-native validation blocks the request; we should still be on /login
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Not found handling', () => {
  test('unauthenticated bogus URL shows the branded 404, not a raw Next.js error screen', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-qa-check')
    await expect(page.getByText(/page not found/i)).toBeVisible()
    // Must not show Next.js's raw internal fallback text
    await expect(page.getByText(/NEXT_HTTP_ERROR_FALLBACK/)).toHaveCount(0)
  })
})
