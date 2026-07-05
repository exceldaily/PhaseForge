# Quality Gate Audit

Branch `fable/quality-gate`. Method: live manual testing against the running dev server
through a real authenticated browser session (Chrome, connected via the claude-in-chrome
MCP), cross-referenced with code inspection for every finding before it was called a bug.
Where a first read looked like a bug, it was re-verified before being logged — see
"False alarms" below; this environment has a screenshot-timing quirk that produced several
initial false positives, all caught and corrected.

Mobile/tablet viewport emulation was **not achievable** in this remote environment (window
resize calls did not change the actual browser viewport — `window.innerWidth` stayed at
desktop size regardless of requested dimensions). Mobile coverage here is a **code-based
responsive audit** (Tailwind breakpoint classes, existing mobile drawer/table patterns),
not a live pixel-level pass. Flagged as a required manual step in RELEASE_CHECKLIST.md.

## Results by area

| Area | Result | Notes |
|---|---|---|
| **Auth** — sign-in form, invalid credentials, empty submission | Pass | Verified live + e2e; friendly error shown, native validation blocks empty submit |
| **Auth** — protected route redirect | Pass | 10 protected paths verified via e2e; all redirect signed-out visitors to /login |
| **Auth** — session persistence | Pass | Existing session reused correctly on repeated navigation |
| **Projects** — create | Pass | Verified live (form → list, no fake buttons) |
| **Projects** — edit / detail drawer | **Was broken → Fixed** | Project Manager field printed a raw UUID instead of the resolved name (P2) |
| **Projects** — Gantt chart render | Pass | Bars, today-marker, zoom controls all render correctly |
| **Projects** — Tasks (phases) checklist | Pass | Add/complete/delete all verified with instant UI update, no reload |
| **Projects** — Punch list create | Pass | Required-photo validation shows a clear inline error, not silent failure |
| **Projects** — invalid ID handling | **Was broken → Fixed** | No branded not-found page existed anywhere (P1) — now fixed globally |
| **Calls** — create | Pass | Instant list refresh, queue chip counts update correctly |
| **Calls** — status change | Pass | List correctly excludes cancelled/closed calls from the default view (initial read was a false alarm — see below) |
| **Calls** — search/filter | Pass | Verified live and via e2e |
| **Customers** — edit | Pass | Status change (Prospect→Active) persisted correctly (fixed in a prior sprint, re-confirmed here) |
| **Customers** — delete | Pass | Confirmation dialog explains the cascade clearly; cancel works without side effects |
| **Files** — empty state | Pass | Clear, on-brand empty state with upload CTA |
| **Files** — upload/delete | Not re-verified live (native OS file picker isn't automatable via the browser-control tool used this pass) | Covered by a real Playwright e2e test (`setInputFiles`) instead — see e2e/authenticated-workflows.spec.ts |
| **Search** (Projects) | Pass | Filters both the board and the executive-snapshot metrics correctly |
| **Console / error noise** | **Was broken → Fixed** | A raw `<script>` tag in the root layout fired a React console error on every client navigation (P3, cosmetic but noisy) |
| **Navigation / sidebar** | Pass | Grouped, collapsible, correct active-state highlighting |
| **Dashboard** | Pass | Command Band renders live counts correctly |

## Confirmed bugs (see BUG_BACKLOG.md for full detail)

1. **[P1] Missing custom not-found pages** — every `notFound()` call (Projects, Customers,
   Invoices, Boards, and any future route) fell through to Next.js's raw, unbranded
   `NEXT_HTTP_ERROR_FALLBACK` screen, with no sidebar and no way back into the app.
2. **[P2] Project Manager UUID leak** — `ProjectDetailPanel.tsx` rendered
   `project.project_manager` (a raw profile UUID for legacy records) directly instead of
   resolving it through the `members` map it already received as a prop. Every other
   renderer in the codebase (board cards, dashboard, Gantt header, reports) already did
   this resolution correctly — this component was the one outlier.
3. **[P3] Console noise on every navigation** — the theme flash-prevention script used a
   raw `<script dangerouslySetInnerHTML>` tag instead of `next/script` with
   `beforeInteractive`, causing a React dev warning on every client-side route change.

## False alarms (investigated, confirmed not bugs)

- **"Full View" button appeared to do nothing** — it worked; the screenshot captured
  immediately after the click returned a stale pre-navigation frame (environment quirk).
- **Checklist "Add task" appeared to submit nothing on Enter** — it worked; same stale-
  screenshot timing. Confirmed correct on a follow-up screenshot with a short wait.
- **Call row appeared to still show "Open" after changing status to "Cancelled"** — the
  row had actually been correctly removed from the (open-only) default filtered view;
  re-verified by closing the drawer and re-reading the list state.
- **Project search appeared to do nothing when typed** — the initial click missed the
  input's actual clickable bounding box; a precisely-targeted click confirmed search
  filters both the list and the executive-snapshot metrics correctly.

## Not retested this pass (documented, not hidden)

- Gantt drag-and-drop date editing — no drag gesture was exercised; date fields exist and
  render correctly, but interactive rescheduling wasn't exercised live this pass.
- True responsive/mobile viewport rendering — see note at top of this document.
- Full authenticated Playwright suite — requires `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`
  (see TESTING_GUIDE.md); the underlying workflows were instead verified via a real
  manual browser session in this pass.
