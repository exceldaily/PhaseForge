# File Management & Deletion

PhaseForge has two live file surfaces (plus one legacy table left untouched):

| Surface | Storage bucket | Metadata table | Used by |
|---|---|---|---|
| Operations Files (/app/files) | `org-files` (private, per-org path) | `org_files` | Files module, record attachments (operations) |
| Project attachments | `project-attachments` | `project_attachments` | Project detail → Files tab |
| Legacy `attachments` table | — | `attachments` | Historical; not written to by current UI; untouched for data safety |

## Capabilities (after this sprint)

| Action | Operations Files | Project attachments |
|---|---|---|
| Upload (multi-select) | ✅ (multiple) | ✅ (single per pick) |
| Download / open | ✅ signed URL (5 min) | ✅ signed URL |
| Rename | ✅ metadata display name | ➖ not supported (schema stores name at upload; next sprint) |
| **Delete** | ✅ **new this sprint** | ✅ (existed; UX upgraded) |
| Confirmation dialog | ✅ ConfirmDialog (explains permanence) | ✅ ConfirmDialog (replaced window.confirm) |
| Inline error on failure | ✅ | ✅ (replaced alert()) |
| Uploader + date shown | ✅ | ✅ |
| Linked record shown | ✅ ("Linked To" column) | n/a (always the project) |
| Filters | type, linked record, customer, uploader, date range, search | n/a (short per-project list) |
| Empty states | ✅ | ✅ |

## Deletion design (no orphans, no silent failures)

`deleteOrgFile` (src/app/app/files/actions.ts):

1. Load the metadata row scoped to the caller's org (`requireModule('files')` first).
2. Authorize: manager role or the original uploader (mirrors RLS; RLS re-enforces).
3. Delete the **storage object first**. If storage errors with anything other than
   not-found → abort, keep metadata, return the error (shown in the dialog).
   Not-found is tolerated: object already gone, proceed to metadata cleanup.
4. Delete the metadata row. If this fails, the error says exactly what state you're in.
5. Log to `ops_activity`, revalidate, UI refreshes immediately.

Order rationale: a metadata row without an object is a visible, deletable inconsistency;
an object without metadata is invisible cost forever. So the object goes first.

Rename is metadata-only by design — Supabase Storage has no rename primitive, and
copy+delete on large files risks partial failure. The storage path is treated as an
immutable ID; the display name is what users see and search.

## Authorization summary

- Server actions check role before touching anything.
- RLS on `org_files`: delete allowed to managers or the uploader, org-scoped, module-gated.
- Storage policies: objects only reachable when the path's first folder equals the caller's
  `company_id` — cross-org deletion is impossible even with a leaked path.

## Manual verification steps (repeat after any file-related change)

1. /app/files → Upload → pick 2 files → both appear with your name + "just now".
2. Rename one (pencil → type → Enter) → name updates in the list.
3. Delete it → dialog explains permanence → Confirm → row disappears without page reload.
4. Supabase Dashboard → Storage → org-files → confirm the object is gone.
5. Failure path: delete the storage object manually in the dashboard first, then delete in
   the app → still succeeds (tolerated not-found), metadata cleaned up.
6. As a `staff` user: delete button on someone else's file → server returns
   "You can only delete files you uploaded." in the dialog; file remains.
7. Project → Files tab → upload, then delete → same dialog pattern, list refreshes,
   `project-attachments` object removed.
