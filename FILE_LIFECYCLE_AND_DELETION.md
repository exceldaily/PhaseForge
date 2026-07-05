# File Lifecycle & Deletion

Full detail lives in FILE_MANAGEMENT_AND_DELETION.md (written during the stabilization
sprint); this doc is the lifecycle contract + test script required by the hardening sprint.

## Lifecycle state machine (org-files surface)

upload → (optional) link to record → rename (metadata only) → download via 5-min signed URL
→ delete (storage object first, then metadata; not-found tolerated; any other storage error
aborts with the metadata kept and the reason shown in-dialog).

Ordering rationale: metadata-without-object is visible and cleanable; object-without-metadata
is invisible cost forever — so the object dies first. Double-delete is guarded client-side
(busy state) and server-side (row lookup returns "already deleted").

Authorization: server action checks manager-or-uploader, RLS re-checks it, and the storage
policy independently requires the object path's org folder to match the caller's company.
Photos attached to equipment readings ride the same bucket with `record_type='asset_reading'`.

## Repeatable test script

1. Upload two files on /app/files → both rows show uploader + timestamp.
2. Rename one → persists after hard refresh.
3. Delete it → dialog warns permanence → confirm → row gone, no reload; Storage browser
   confirms the object is gone.
4. Delete a file whose storage object was manually removed first → still succeeds (metadata
   cleaned; tolerated not-found).
5. As a `staff` user, delete another user's file → in-dialog error, file intact.
6. Kill the network mid-delete → error surfaces, dialog stays open, retry works.
7. Project → Files tab: upload → download → delete (same dialog pattern, list refreshes).
8. Equipment reading with 2 photos → photos open via signed URLs from the asset history modal.

Status: steps 1–4 and 7 verified this week on local against the live project; 5, 6, 8 are in
PRODUCTION_READINESS_CHECKLIST.md for the human pass.
