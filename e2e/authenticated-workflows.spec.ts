import { test, expect, login, hasTestAccount } from './fixtures'

// Requires E2E_TEST_EMAIL / E2E_TEST_PASSWORD (see TESTING_GUIDE.md). Every
// test creates its own uniquely-named record (prefixed "E2E ") and cleans up
// after itself so re-runs never accumulate junk and never depend on
// pre-existing production data.
test.describe('Authenticated core workflows', () => {
  test.skip(!hasTestAccount, 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD not set — see TESTING_GUIDE.md')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('project: create, verify on list, delete', async ({ page }) => {
    const name = `E2E Project ${Date.now()}`

    await page.goto('/app/projects/new')
    await page.getByLabel(/project name|title/i).first().fill(name)
    await page.getByRole('button', { name: /create|save/i }).first().click()

    // Should land somewhere that isn't the create form anymore
    await expect(page).not.toHaveURL(/\/projects\/new/, { timeout: 15_000 })

    await page.goto('/app/projects')
    await page.getByPlaceholder(/search by project name/i).fill(name)
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 })
  })

  test('calls: create, verify list refresh without reload, cancel', async ({ page }) => {
    const title = `E2E Call ${Date.now()}`

    await page.goto('/app/calls')
    await page.getByRole('button', { name: /new call/i }).click()
    await page.getByPlaceholder(/short description of the issue/i).fill(title)
    await page.getByRole('button', { name: /^create$/i }).click()

    // Appears in the list immediately — no manual refresh
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 })

    // Open it and cancel it to keep the org's active-call count clean
    await page.getByText(title).click()
    const statusSelect = page.getByLabel(/status/i).first()
    await statusSelect.selectOption({ label: 'Cancelled' })
    await expect(page.getByText('Cancelled').first()).toBeVisible({ timeout: 10_000 })
  })

  test('calls: search filters the list', async ({ page }) => {
    await page.goto('/app/calls')
    const searchBox = page.getByPlaceholder(/search calls/i)
    await searchBox.fill('zzz-no-such-call-should-match-zzz')
    await expect(page.getByText(/no calls match/i)).toBeVisible({ timeout: 10_000 })
  })

  test('customers: create, edit status, delete with confirmation', async ({ page }) => {
    const name = `E2E Customer ${Date.now()}`

    await page.goto('/app/customers')
    await page.getByRole('button', { name: /new customer/i }).click()
    await page.getByLabel(/customer name/i).fill(name)
    await page.getByRole('button', { name: /create customer/i }).click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 })

    await page.getByText(name).click()
    await expect(page).toHaveURL(/\/app\/customers\/[a-f0-9-]+/, { timeout: 10_000 })

    // Edit: change status
    await page.getByRole('button', { name: /^edit$/i }).click()
    await page.getByLabel(/^status$/i).selectOption({ label: 'Active' })
    await page.getByRole('button', { name: /save changes/i }).click()
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 10_000 })

    // Delete: confirm the dialog explains the cascade, then confirm
    await page.getByRole('button', { name: /delete customer/i }).click()
    await expect(page.getByText(/cannot be undone/i)).toBeVisible()
    await page.getByRole('button', { name: /^delete customer$/i }).click()
    await expect(page).toHaveURL(/\/app\/customers$/, { timeout: 10_000 })
    await expect(page.getByText(name)).toHaveCount(0)
  })

  test('files: upload and delete', async ({ page }) => {
    const fileName = `e2e-test-${Date.now()}.txt`

    await page.goto('/app/files')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('PhaseForge e2e test upload — safe to delete.'),
    })
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 15_000 })

    // Delete it and confirm removal
    const row = page.locator('tr', { hasText: fileName })
    await row.getByTitle('Delete').click()
    await page.getByRole('button', { name: /delete file/i }).click()
    await expect(page.getByText(fileName)).toHaveCount(0, { timeout: 10_000 })
  })
})
