'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireModule, logOpsActivity } from '@/lib/operations/server'

const MANAGER_ROLES = ['owner', 'admin', 'dispatcher', 'project_manager']

// Delete a file: storage object FIRST, then metadata. If the storage delete
// fails for any reason other than the object already being gone, we keep the
// metadata row and surface the error — never orphan a live object, never
// silently fail.
export async function deleteOrgFile(fileId: string) {
  const ctx = await requireModule('files')
  const supabase = await createClient()

  const { data: file } = await supabase
    .from('org_files')
    .select('id, storage_path, file_name, uploaded_by')
    .eq('id', fileId)
    .eq('company_id', ctx.companyId)
    .single()

  if (!file) return { error: 'File not found (it may have already been deleted).' }

  // Authorization (mirrors RLS: manager or the uploader). RLS re-enforces this.
  if (!MANAGER_ROLES.includes(ctx.opsRole) && file.uploaded_by !== ctx.userId) {
    return { error: 'You can only delete files you uploaded.' }
  }

  const { error: storageError } = await supabase.storage
    .from('org-files')
    .remove([file.storage_path])

  // "Not found" in storage is fine — the object is already gone; clean up metadata.
  if (storageError && !/not.?found/i.test(storageError.message)) {
    return { error: `Could not delete the stored file: ${storageError.message}` }
  }

  const { error: dbError } = await supabase
    .from('org_files')
    .delete()
    .eq('id', fileId)
    .eq('company_id', ctx.companyId)

  if (dbError) return { error: `File removed from storage but the record failed to delete: ${dbError.message}` }

  await logOpsActivity({
    companyId: ctx.companyId, actorId: ctx.userId,
    recordType: 'file', recordId: fileId, action: 'deleted',
    detail: { file_name: file.file_name },
  })
  revalidatePath('/app/files')
  return { ok: true }
}

// Rename updates the display name in metadata only — the storage path is
// immutable by design (Supabase Storage has no rename; copy+delete risks data
// loss on large files). Downloads keep working because signed URLs use the path.
export async function renameOrgFile(fileId: string, newName: string) {
  const ctx = await requireModule('files')
  const trimmed = newName.trim()
  if (!trimmed) return { error: 'File name cannot be empty.' }
  if (trimmed.length > 255) return { error: 'File name is too long.' }

  const supabase = await createClient()
  const { data: file } = await supabase
    .from('org_files')
    .select('id, uploaded_by')
    .eq('id', fileId)
    .eq('company_id', ctx.companyId)
    .single()

  if (!file) return { error: 'File not found.' }
  if (!MANAGER_ROLES.includes(ctx.opsRole) && file.uploaded_by !== ctx.userId) {
    return { error: 'You can only rename files you uploaded.' }
  }

  const { error } = await supabase
    .from('org_files')
    .update({ file_name: trimmed })
    .eq('id', fileId)
    .eq('company_id', ctx.companyId)

  if (error) return { error: error.message }
  revalidatePath('/app/files')
  return { ok: true }
}
