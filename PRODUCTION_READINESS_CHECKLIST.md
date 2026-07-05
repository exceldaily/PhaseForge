# Production Readiness Checklist

Run top to bottom before merging/deploying. Items marked ☑ were verified on
`fable/phaseforge-stabilization` during the sprint (local dev + `npm run build`); items
marked ☐ must be re-verified in the deployed environment by a human.

## Build & static checks

- ☑ `npm run build` passes (all routes compile, TypeScript clean)
- ☑ ESLint clean on every file touched this sprint (legacy debt documented, untouched)
- ☑ No new dependencies introduced
- ☑ No migrations introduced this sprint (DB state unchanged from operations branch)
- ☑ No secrets in code (bundled anon key only, as designed by Supabase)

## Auth & existing functionality (regression)

- ☐ Login with existing account
- ☐ Dashboard renders; Command Band shows counts (or all-clear) without errors
- ☐ Existing project opens; Gantt renders; phases drag/edit
- ☐ Task (phase) create/edit/complete
- ☐ Punch item create/edit/complete (+ photo)
- ☐ Notes/comments save and appear without refresh
- ☐ Boards kanban drag works
- ☐ Notifications bell works

## Files (the hardened paths)

- ☐ /app/files: upload 2 files → both listed with uploader + time
- ☐ Rename a file (pencil → Enter) → name persists after refresh
- ☐ Delete a file → confirmation dialog → row gone without page reload
- ☐ Supabase Storage → org-files: object actually removed
- ☐ As staff role: deleting someone else's file shows the permission error in-dialog
- ☐ Project → Files tab: upload, download, delete (same dialog pattern)

## Navigation

- ☐ Sidebar shows groups: Work / Directory / Insights / Financial / Library / Admin
- ☐ Collapse a group → navigate elsewhere → preference persisted
- ☐ Group with current page cannot be collapsed shut (stays open)
- ☐ Disable a module (Settings → Modules) → its link disappears AND direct URL redirects
- ☐ Collapsed (icon) sidebar mode still navigates correctly

## Operations modules

- ☐ Customer → Location → Asset create chain
- ☐ Call create (incl. dashboard quick action opening the form directly)
- ☐ Call assign / status change / note with category
- ☐ Yellow NEW UPDATE badge appears for another user's note; clears on open
- ☐ Calls list/card/board views all render; filters combine correctly
- ☐ Invoice: draft from invoice-ready call → line items → print-to-PDF
- ☐ Reports (operations): stat tiles deep-link to pre-filtered pages

## Mobile spot-check (phone width)

- ☐ Sidebar drawer opens/closes
- ☐ Calls list readable; filter drawer usable
- ☐ Dashboard Command Band stacks vertically
- ☐ File upload works from mobile browser
- ☐ No horizontal scroll on dashboard/customers/calls (board view scrolls by design)

## Error/empty states

- ☐ Every operations list shows its empty state with a working CTA
- ☐ Kill network → attempt a save → visible inline error, form data preserved
- ☐ No fake/dead buttons encountered during the pass (report any found)

## Known gaps going into production (accepted, documented)

1. No global search (per-page search/filters only)
2. Saved-views/tags UI not built (schema live)
3. Legacy project cards still badge-heavy (spec in UX_REDESIGN_DECISIONS.md)
4. `profiles_update` RLS hardening trigger for ops_role not yet applied (FABLE_HANDOFF risk #1)
5. Client-side filtering caps at 500 rows on calls/files
