# Bug Backlog

## Fixed this sprint

### BUG-001 — Missing branded not-found pages [P1] — FIXED

**Reproduction:** Navigate to any valid-looking-but-nonexistent record URL while signed in,
e.g. `/app/projects/00000000-0000-0000-0000-000000000000`, or any deleted Customer/Invoice/
Board ID.

**Expected:** A branded, on-theme "not found" message with a way back into the app.

**Actual (before fix):** Next.js's raw internal fallback screen — "Something went wrong /
NEXT_HTTP_ERROR_FALLBACK;404" — no sidebar, no navigation, no brand styling.

**Root cause:** Every detail page (`projects/[id]`, `customers/[id]`, `invoices/[id]`,
`boards/[id]`) correctly calls Next's `notFound()` on a missing/cross-org record, but no
`not-found.tsx` existed anywhere in the app to catch it, so Next fell back to its default.

**Files:** `src/app/app/not-found.tsx` (new, renders inside the AppShell layout — sidebar
stays visible), `src/app/not-found.tsx` (new, global fallback for unauthenticated/typo'd
URLs), `src/app/app/error.tsx` (new, catches runtime errors at the route-segment level).

**Fix:** Added both not-found pages plus a matching `error.tsx` for the authenticated
section, styled consistently with the existing `ErrorBoundary` component.

**Regression test:** `e2e/auth.spec.ts` → "unauthenticated bogus URL shows the branded 404,
not a raw Next.js error screen" (asserts the NEXT_HTTP_ERROR_FALLBACK text is absent).

---

### BUG-002 — Project Manager shows raw UUID [P2] — FIXED

**Reproduction:** Open Projects → click a project card whose `project_manager` field stores
a legacy profile ID (not a plain-text name) → the compact detail drawer opens.

**Expected:** "Project Manager: Brad Harvey" (resolved display name), matching what the
Gantt page header, board cards, dashboard, and reports already show for the same field.

**Actual (before fix):** "Project Manager: 4ee9737f-a922-4aa3-97f9-ac1bf5d516fc" (raw UUID).

**Root cause:** `ProjectDetailPanel.tsx` received a `members` prop (`Pick<Profile,'id'|
'full_name'>[]`) but never destructured or used it — it rendered `project.project_manager`
directly. Every other renderer of this field in the codebase (`ProjectBoardCard.tsx`,
`ProjectDetailShell.tsx`, `dashboard/page.tsx`, `ReportsClient.tsx`) already builds a
`memberMap` and falls back to the raw value only if no match is found.

**Files:** `src/components/projects/ProjectDetailPanel.tsx`

**Fix:** Added the same `memberMap`/`pmName` resolution used everywhere else in the
codebase; two-line change, zero risk (identical pattern already proven in 4 other files).

**Regression test:** Manual — verified live (`PROJECT MANAGER` now shows "Brad Harvey").
Not covered by an automated test this pass since it requires seeded legacy-format data
(a `project_manager` column holding a UUID rather than free text) to reproduce; documented
here so a future data-driven test can target it directly.

---

### BUG-003 — Console error on every client navigation [P3] — FIXED

**Reproduction:** Open browser DevTools console, sign in, navigate between any two pages.

**Expected:** No console errors from normal navigation.

**Actual (before fix):** `Encountered a script tag while rendering React component...`
logged as an ERROR on every single client-side route change.

**Root cause:** The root layout used a raw `<script dangerouslySetInnerHTML>` tag (for
flash-of-wrong-theme prevention) instead of Next.js's dedicated `next/script` component
with `strategy="beforeInteractive"`, which exists specifically for this use case.

**Files:** `src/app/layout.tsx`

**Fix:** Replaced the raw tag with `<Script id="theme-init" strategy="beforeInteractive" ...>`
per the documented Next.js 16 pattern (verified against `node_modules/next/dist/docs/`
per this repo's AGENTS.md instruction). Theme flash-prevention behavior is unchanged —
`beforeInteractive` still runs before hydration/paint.

**Regression test:** Manual — verified live via `read_console_messages`; zero errors across
repeated navigation after the fix, versus 2+ per navigation before.

## Not fixed — documented for next sprint

### BACKLOG-001 — No true mobile viewport QA this pass

Window/viewport resize did not take effect in this remote testing environment (OS-level
constraint, not an app bug). Mobile behavior was audited via code (responsive Tailwind
classes already present from the stabilization sprint) but not pixel-verified live.
**Recommendation:** run a manual pass on a real phone/tablet, or a CI environment where
Playwright's device emulation actually controls the viewport (it does — this was purely a
limitation of the specific browser-control tool used for live QA in this session, not a
limitation of the Playwright suite added here).

### BACKLOG-002 — Gantt drag-and-drop rescheduling untested

Not exercised live this pass (no drag gesture attempted). Recommend a dedicated e2e test
once a stable `data-testid` exists on the draggable phase bars.

### BACKLOG-003 — Authenticated Playwright suite needs a seeded test account

`e2e/authenticated-workflows.spec.ts` covers project/call/customer/file CRUD but skips
itself without `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`. See TESTING_GUIDE.md.
