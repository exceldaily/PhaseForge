import { formatDate } from '@/lib/dates'
import { Project } from '@/types/app'

type ProjectAuditFields = Pick<Project, 'updated_at' | 'updated_by' | 'created_by'>
type ProjectAuditError = { message?: string | null; details?: string | null; hint?: string | null }
type SupabaseProjectUpdater = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<{ error: ProjectAuditError | null }>
    }
  }
}

export function isMissingUpdatedByColumnError(
  error: ProjectAuditError | null | undefined
) {
  const combined = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  return combined.includes('updated_by') && combined.includes('column')
}

/** True when the projects.links column hasn't been added yet (pre-migration). */
export function isMissingLinksColumnError(
  error: ProjectAuditError | null | undefined
) {
  const combined = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  return combined.includes('links') && (combined.includes('column') || combined.includes('schema cache'))
}

export function getProjectLastUpdatedByName(
  project: ProjectAuditFields,
  memberMap: Record<string, string>
) {
  const userId = project.updated_by || project.created_by
  return userId ? memberMap[userId] || 'Team member' : 'Team member'
}

export function getProjectLastUpdatedLabel(
  project: ProjectAuditFields,
  memberMap: Record<string, string>
) {
  return `* Last updated by ${getProjectLastUpdatedByName(project, memberMap)} on ${formatDate(
    project.updated_at,
    'MMM d, yyyy h:mm a'
  )}`
}

export async function touchProjectAudit(
  supabase: SupabaseProjectUpdater,
  projectId: string,
  userId: string,
  updatedAt = new Date().toISOString()
) {
  let { error } = await supabase
    .from('projects')
    .update({ updated_at: updatedAt, updated_by: userId })
    .eq('id', projectId) as { error: ProjectAuditError | null }

  if (error && isMissingUpdatedByColumnError(error)) {
    ;({ error } = await supabase
      .from('projects')
      .update({ updated_at: updatedAt })
      .eq('id', projectId) as { error: ProjectAuditError | null })
  }

  return { error, updatedAt }
}
