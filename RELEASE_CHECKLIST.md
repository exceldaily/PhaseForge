# Release Checklist

Run top to bottom before deploying. ☑ = automated by `npm run verify`; ☐ = manual.

## Pre-release checks

- ☑ `npm run typecheck` — TypeScript compiles clean
- ☑ `npm run lint` — ESLint clean
- ☑ `npm test` — Vitest unit suite passes
- ☑ `npm run e2e` — Playwright suite passes (auth/redirect/404 always; CRUD suite passes
  or cleanly skips depending on `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`)
- ☑ `npm run build` — production build succeeds
- ☐ Run the full pipeline once with a real test account configured
  (`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` set) so the CRUD suite actually executes, not just
  skips, at least once before a release that touches Projects/Calls/Customers/Files

## Database / migration checks

- ☐ Any new `supabase/migrations/*.sql` reviewed for additive-only changes (no `DROP`,
  no destructive `ALTER`)
- ☐ Migration applied to the target Supabase project (see MIGRATION_AND_ROLLBACK.md for
  the standing process — apply via SQL editor or MCP, confirm with `list_tables`/`get_advisors`)
- ☐ `get_advisors(type: security)` re-run after any RLS/policy change — no new WARN/ERROR
  introduced
- ☐ Rollback SQL identified and ready before applying (see SUPABASE_SECURITY_AND_RLS_AUDIT.md
  and MIGRATION_AND_ROLLBACK.md for the standing patterns)

## File storage checks

- ☐ Upload a file on `/app/files`, confirm it lists with correct uploader/timestamp
- ☐ Delete it, confirm the Storage object is actually gone (Supabase Dashboard → Storage)
- ☐ Confirm a non-owner/non-manager cannot delete another user's file (in-dialog error)

## Manual smoke tests (5 minutes, any environment)

- ☐ Sign in with a real account → lands on Dashboard, Command Band renders without errors
- ☐ Open an existing project → Gantt, Tasks, Punch List, Files, Activity tabs all load
- ☐ Create a task (phase checklist item), check it complete, delete it
- ☐ Create a punch item with a photo, mark it complete
- ☐ Create a Call, verify it appears in the list immediately, change its status
- ☐ Open Customers, edit a customer's status, confirm it persists after refresh
- ☐ Navigate to a deleted/bogus record URL → branded "We couldn't find that" page appears
  (NOT a raw Next.js error screen) — this is the BUG-001 regression check
- ☐ Open DevTools console, click through 5+ pages → zero console errors (BUG-003 regression
  check — previously fired an error on every navigation)
- ☐ Sign out → confirm redirect to `/login` and that `/app/*` URLs are unreachable

## Mobile / tablet checks (manual — see QUALITY_GATE_AUDIT.md limitation note)

- ☐ Sidebar collapses to a drawer below the `md` breakpoint
- ☐ Filter bars collapse into the mobile drawer pattern (FilterBar component)
- ☐ Tables that hide columns on mobile (`hidden md:table-cell`) show only essential columns
- ☐ Modals/drawers are full-width and scrollable on a real phone
- ☐ File upload works from a mobile browser's native picker

## Rollback checks

- ☐ Confirm the target branch/commit to roll back to is known (`git log --oneline`)
- ☐ Confirm no destructive migration was applied that a code rollback can't undo alone —
  if one was, the corresponding rollback SQL (documented per-change) must run first
- ☐ `git revert --no-edit <commit>` tested in a scratch branch before using it for real,
  if reverting a specific milestone rather than the whole branch

See FABLE_HANDOFF.md for exact git commands for this sprint's commits.
