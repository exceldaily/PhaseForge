# Product Stabilization Audit

Branch: `fable/phaseforge-stabilization` (based on `fable/phaseforge-operations-foundation`).
Scope: every major screen/action, with classification and root cause. Items marked **FIXED THIS
SPRINT** are addressed in this branch; everything else is honestly listed for the next sprint.

## Classification summary

| Area | Status | Root cause / notes |
|---|---|---|
| Login / auth / signup | Working | Untouched; verified via build + prior sessions |
| Projects CRUD | Working | Long-standing flows; delete has confirm dialog |
| Project attachments (upload/download/delete) | Working, crude UX | Uses `window.confirm`/`alert` for delete feedback — functional, not pretty. **FIXED THIS SPRINT** (custom confirm dialog, inline errors) |
| Gantt / phases / dependencies | Working | Untouched this sprint |
| Punch lists (+ photos) | Working | Verified June sessions; photos need native build on mobile app only |
| Boards / kanban | Working | Untouched |
| My Work | Working | Untouched |
| Notifications | Working | Untouched |
| **Files page (operations)** | **Broken by omission** | v1 shipped upload/download only — **no delete, no rename**. Deleting was impossible; orphaned storage objects likely over time. **FIXED THIS SPRINT** (delete w/ confirmation + storage object cleanup, rename, inline errors) |
| Files page linking | Partially working | Uploads always land in "Library"; no UI to link a file to a record from this page. Files linked from records display correctly. Documented; record-side linking is next sprint |
| **Sidebar navigation** | **Confusing / cluttered** | 19 flat items after operations modules; competing labels, no grouping. **FIXED THIS SPRINT** (grouped, collapsible sections) |
| **Dashboard** | **Needs redesign (partial)** | Good project sections (At Risk, Tasks Due, Milestones, Activity) but no "what's assigned to me", no operations attention (overdue calls, unread updates), no quick actions. **FIXED THIS SPRINT** (Attention/My Work/Quick Actions band added on top; existing sections preserved) |
| Calls module | Working | Built + verified this week; no admin delete UI (calls are cancelled via status — intentional, documented) |
| Calls unread alert | Working | last_note_at vs call_reads; verified locally |
| Customers / Locations / Assets | Working | No delete UI for customers (intentional v1 — archive via status; delete is admin-RLS-allowed for future UI) |
| Staff / Vendors | Working | Vendor/staff edits inline; no destructive actions exposed |
| Invoices + print PDF | Working | Line-item CRUD + status + print verified in build |
| Reports (project) | Working | Plan-gated as before |
| Reports (operations) | Working | Live aggregates; deep-links verified |
| Settings → Modules | Working | Owner/admin toggles; RLS + route guard enforced |
| Tickets (legacy dispatch) | Working, **duplicate concept** | Kalos-flavored predecessor of Calls. Kept per safety rules; demoted in nav grouping. Recommend per-org disable once Calls adoption confirmed |
| Analytics page | Working, overlaps Reports | Both exist; grouped under one nav section now; merge candidates next sprint |
| Global search | **Missing** | No cross-record search anywhere. Highest-value next-sprint item; per-page search + filters exist everywhere as mitigation |
| Mobile web | Partially working | June mobile-web pass covered legacy pages; new operations pages use responsive tables (columns hide at md/lg) + mobile filter drawer. Board view scrolls horizontally by design. Deep mobile QA is next sprint |
| Loading states | Partially working | Server-rendered pages show Next.js route transition; no skeletons on operations pages (acceptable; documented) |
| Empty states | Working | All operations pages ship real empty states with hints/CTAs |
| Error states | Working (ops), crude (legacy attachments) | Ops pages surface action errors inline; legacy uses alert() in two spots — one fixed this sprint |
| Forms that silently fail | None found | All server actions return `{error}` and clients render it |
| Fake/dead buttons | 1 found | Files page implied management but offered none (fixed). No other dead controls found in sweep |

## Root causes (broken/unreliable items)

1. **Files delete missing** — `FilesClient.tsx` v1 scope cut; `org_files` RLS *already permits*
   delete (manager or uploader) and storage policies permit object deletion, so this was purely
   a missing UI + action. Fix: `deleteOrgFile` server action removes the storage object first,
   then metadata; failures surface inline; UI refreshes on success. No orphan path: if storage
   deletion fails with anything other than not-found, metadata is kept and an error shown.
2. **Sidebar clutter** — operations modules were appended flat to an already-full nav.
   Fix: grouped sections (Work / Directory / Financial / Library / Admin) with collapse.
3. **Dashboard blind spots** — page predates operations modules and never had a personal
   summary. Fix: additive top band fed by the same server query pass; zero removed sections.

## Duplicates / candidates to retire (not removed this sprint — safety rules)

- **Tickets vs Calls**: same concept, Tickets is Kalos-specific. Demoted in nav; keep until the
  org confirms Calls covers the workflow, then disable via existing `dispatch_enabled` flag.
- **Analytics vs Reports**: overlapping metrics; both retained, grouped together in nav.
- Legacy `attachments` table vs `project_attachments` vs `org_files`: three file stores exist
  historically. Untouched (data safety); unification is a next-sprint schema project.

## Label/badge audit

Operations cards already follow a ≤3-indicator rule (status pill + priority + one alert).
Legacy project cards show up to 5 badges; trimming them is riskier (used across boards/gantt)
and deferred with a documented spec in UX_REDESIGN_DECISIONS.md.

## Verification performed this sprint

- `npm run build` green after every milestone commit (routes compile, TS clean).
- ESLint clean on all files touched this sprint.
- Manual smoke (local dev, real Supabase): login, dashboard render, sidebar groups, project
  open, file upload → rename → delete (success + failure paths), calls list/detail.
