# Testing Guide

PhaseForge has two test layers:

| Layer | Tool | Scope | Command |
|---|---|---|---|
| Unit | Vitest | Pure functions (`src/lib/**`) | `npm test` |
| End-to-end | Playwright | Real browser against the dev server | `npm run e2e` |

## Unit tests (Vitest)

```bash
npm test              # run once
npx vitest             # watch mode
```

Config: `vitest.config.ts` excludes `e2e/**` so Playwright specs are never picked up by
Vitest (they use a different `test`/`expect` API and would fail under Vitest's runner).

Where to add a new unit test: colocate as `__tests__/*.test.ts` next to the module, following
`src/lib/operations/__tests__/readings.test.ts` as the pattern. Favor pure logic (formatters,
validators, computed helpers) — anything that touches Supabase or the DOM belongs in e2e.

## End-to-end tests (Playwright)

```bash
npm run e2e            # headless, all specs
npm run e2e:ui          # interactive UI mode — best for writing/debugging new tests
```

Config: `playwright.config.ts`. By default it starts `npm run dev` and waits for
`http://localhost:3000/login`, reusing an already-running dev server if one exists (as it
did throughout this QA pass). Override the target with `E2E_BASE_URL` to test against a
different environment (e.g. a preview deployment) without starting a local server.

### Two spec files, two trust levels

- **`e2e/auth.spec.ts`** — runs with **zero setup**. Covers protected-route redirects, the
  login form, invalid-credential handling, and the branded 404 page. These never touch real
  data and never require credentials.
- **`e2e/authenticated-workflows.spec.ts`** — covers project/call/customer/file CRUD.
  **Requires a test account.** Every test in this file creates its own uniquely-named record
  (prefixed `E2E `) and deletes/cancels it before finishing, so re-runs never accumulate
  junk and this file never depends on pre-existing production data.

### Enabling the authenticated suite

Set two environment variables before running:

```bash
# PowerShell
$env:E2E_TEST_EMAIL = "your-test-account@example.com"
$env:E2E_TEST_PASSWORD = "the-account-password"
npm run e2e

# bash
E2E_TEST_EMAIL=your-test-account@example.com E2E_TEST_PASSWORD=the-password npm run e2e
```

Without these, `authenticated-workflows.spec.ts` skips itself (visible as "skipped" in the
report, not a failure) — `npm run e2e` stays green in any environment, CI included.

**Use a dedicated test account, not your real one.** Recommended: a low-privilege member
in a disposable/demo organization (Demo Organization A/B, if you've run
`scripts/seed_demo_orgs.sql`), so the CRUD tests never touch anything a real user relies on.

### Why there's no full authenticated suite running by default

The tests were authored against real UI selectors (labels, placeholders, button text) and
manually verified against the running app during this QA pass — but running them requires
a password, and no test credentials were available in this environment. The infrastructure
is complete and ready; supplying `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` is the only remaining
step to get full automated CRUD coverage running.

## One-command verification

```bash
npm run verify
```

Runs, in order: TypeScript typecheck → ESLint → Vitest → Playwright e2e → production build.
Stops at the first failure. Safe to run repeatedly; makes no destructive changes. The e2e
step runs whatever `authenticated-workflows.spec.ts` can run given your environment
variables (all-skip is fine; it won't fail the pipeline).

## Adding a new e2e test

1. Decide which file it belongs in (no-auth vs. authenticated).
2. Import from `./fixtures`, not `@playwright/test` directly — this keeps the
   `hasTestAccount` skip-gate consistent across the suite.
3. If it creates data, delete/cancel it before the test ends (see the `customers:` and
   `calls:` tests in `authenticated-workflows.spec.ts` for the pattern).
4. Prefer role/label/placeholder selectors (`getByRole`, `getByLabel`, `getByPlaceholder`)
   over CSS classes — they match what a user actually sees and survive styling changes.
