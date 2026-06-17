'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingLinksColumnError } from '@/lib/projectAudit'
import { logger } from '@/lib/logger'

// ── Phase creation ────────────────────────────────────────────────────────

export async function createPhaseQuick(projectId: string, data: { name: string; start_date: string; end_date: string }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: project } = await supabase.from('projects').select('company_id').eq('id', projectId).single()
    if (!project) throw new Error('Project not found')

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
      throw new Error('Not authorized')
    }

    const { data: maxSort } = await supabase
      .from('phases')
      .select('sort_order')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const { data: phase, error } = await supabase
      .from('phases')
      .insert({
        project_id: projectId,
        name: data.name.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
        status: 'not_started',
        color: '#6366f1',
        sort_order: (maxSort?.sort_order ?? -1) + 1,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/app/projects/${projectId}`)
    revalidatePath(`/app/gantt`)
    return { success: true, phase }
  } catch (err) {
    logger.error('createPhaseQuick', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create phase' }
  }
}

// ── Checklist management ──────────────────────────────────────────────────

export async function addPhaseChecklist(phaseId: string, title: string, assignedTo?: string | null) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Append to the end of the existing list.
    const { data: maxSort } = await supabase
      .from('phase_checklists')
      .select('sort_order')
      .eq('phase_id', phaseId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const payload: Record<string, unknown> = {
      phase_id: phaseId,
      title: title.trim(),
      is_completed: false,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
    }
    if (assignedTo) payload.assigned_to = assignedTo

    let { data: checklist, error } = await supabase.from('phase_checklists').insert(payload).select().single()

    // Graceful fallback if the assigned_to column hasn't been migrated yet.
    if (error && `${error.message}`.toLowerCase().includes('assigned_to')) {
      delete payload.assigned_to
      ;({ data: checklist, error } = await supabase.from('phase_checklists').insert(payload).select().single())
    }

    if (error) throw error

    revalidatePath(`/app/projects`)
    return { success: true, checklist }
  } catch (err) {
    logger.error('addPhaseChecklist', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add checklist' }
  }
}

export async function updatePhaseChecklist(
  checklistId: string,
  updates: { is_completed?: boolean; title?: string; assigned_to?: string | null }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    let { error } = await supabase.from('phase_checklists').update(updates).eq('id', checklistId)

    // Graceful fallback if the assigned_to column hasn't been migrated yet.
    if (error && `${error.message}`.toLowerCase().includes('assigned_to')) {
      const rest = { ...updates }
      delete rest.assigned_to
      if (Object.keys(rest).length > 0) {
        ;({ error } = await supabase.from('phase_checklists').update(rest).eq('id', checklistId))
      } else {
        error = null
      }
    }

    if (error) throw error

    revalidatePath(`/app/projects`)
    return { success: true }
  } catch (err) {
    logger.error('updatePhaseChecklist', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update checklist' }
  }
}

export async function deletePhaseChecklist(checklistId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase.from('phase_checklists').delete().eq('id', checklistId)

    if (error) throw error

    revalidatePath(`/app/projects`)
    return { success: true }
  } catch (err) {
    logger.error('deletePhaseChecklist', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete checklist' }
  }
}

export async function updatePhaseReminders(phaseId: string, reminderNotes: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('phases')
      .update({ reminder_notes: reminderNotes || null, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', phaseId)

    if (error) throw error

    revalidatePath(`/app/projects`)
    return { success: true }
  } catch (err) {
    logger.error('updatePhaseReminders', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update reminders' }
  }
}

// ── Project update with activity logging ──────────────────────────────

export async function updateProject(projectId: string, updates: Record<string, unknown>) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Get old values for activity log
    const { data: oldProject } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (!oldProject) throw new Error('Project not found')

    // Update the project
    let { error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', projectId)

    // Graceful fallback if the links column hasn't been migrated yet.
    if (error && isMissingLinksColumnError(error)) {
      const withoutLinks = { ...updates }
      delete withoutLinks.links
      ;({ error } = await supabase
        .from('projects')
        .update({ ...withoutLinks, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq('id', projectId))
    }

    if (error) throw error

    // Log what changed
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const [key, newValue] of Object.entries(updates)) {
      const oldValue = (oldProject as Record<string, unknown>)[key]
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[key] = { from: oldValue, to: newValue }
      }
    }

    if (Object.keys(changes).length > 0) {
      await supabase.from('activity_logs').insert({
        company_id: (oldProject as Record<string, unknown>).company_id,
        project_id: projectId,
        actor_id: user.id,
        action: 'project_updated',
        payload: changes,
      })
    }

    revalidatePath(`/app/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    logger.error('updateProject', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update project' }
  }
}

// ── Project to board assignment ───────────────────────────────────────────

export async function updateProjectBoard(projectId: string, boardId: string | null, boardColumnId: string | null) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('projects')
      .update({
        board_id: boardId,
        board_column_id: boardColumnId,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', projectId)

    if (error) throw error

    revalidatePath(`/app/projects`)
    revalidatePath(`/app/projects/${projectId}`)
    if (boardId) revalidatePath(`/app/boards/${boardId}`)

    return { success: true }
  } catch (err) {
    logger.error('updateProjectBoard', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update board' }
  }
}

// ── File attachments ──────────────────────────────────────────────────────

export async function uploadProjectAttachment(projectId: string, file: File) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const [{ data: profile }, { data: project }] = await Promise.all([
      supabase.from('profiles').select('role, company_id').eq('id', user.id).single(),
      supabase.from('projects').select('id, company_id').eq('id', projectId).single(),
    ])

    if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
      throw new Error('Not authorized to upload files')
    }
    if (!project) throw new Error('Project not found')
    if (profile.company_id !== project.company_id) {
      throw new Error('Not authorized to upload files to this project')
    }

    const timestamp = Date.now()
    const filename = `${timestamp}-${file.name}`
    const filePath = `projects/${projectId}/${filename}`

    const { error: uploadError } = await admin.storage
      .from('project-attachments')
      .upload(filePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      })

    if (uploadError) {
      logger.error('uploadProjectAttachment: storage upload failed', {
        projectId,
        filePath,
        userId: user.id,
        error: uploadError,
      })
      throw uploadError
    }

    const { error: dbError } = await admin
      .from('project_attachments')
      .insert({
        project_id: projectId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user.id,
      })

    if (dbError) {
      logger.error('uploadProjectAttachment: database insert failed', {
        projectId,
        filePath,
        userId: user.id,
        error: dbError,
      })

      const { error: cleanupError } = await admin.storage
        .from('project-attachments')
        .remove([filePath])

      if (cleanupError) {
        logger.warn('uploadProjectAttachment: failed to clean up orphaned storage object', {
          projectId,
          filePath,
          cleanupError,
        })
      }

      throw dbError
    }

    revalidatePath(`/app/projects/${projectId}`)
    return { success: true, fileName: file.name, uploadedAt: new Date().toISOString() }
  } catch (err) {
    logger.error('uploadProjectAttachment', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to upload file' }
  }
}

export async function deleteProjectAttachment(projectId: string, filePath: string) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const [{ data: profile }, { data: project }] = await Promise.all([
      supabase.from('profiles').select('role, company_id').eq('id', user.id).single(),
      supabase.from('projects').select('id, company_id').eq('id', projectId).single(),
    ])

    if (!profile || !['owner', 'admin', 'manager'].includes(profile.role)) {
      throw new Error('Not authorized to delete files')
    }
    if (!project) throw new Error('Project not found')
    if (profile.company_id !== project.company_id) {
      throw new Error('Not authorized to delete files from this project')
    }

    const { error: storageError } = await admin.storage
      .from('project-attachments')
      .remove([filePath])

    if (storageError) {
      logger.error('deleteProjectAttachment: storage delete failed', {
        projectId,
        filePath,
        userId: user.id,
        error: storageError,
      })
      throw storageError
    }

    const { error: dbError } = await admin
      .from('project_attachments')
      .delete()
      .eq('project_id', projectId)
      .eq('file_path', filePath)

    if (dbError) {
      logger.error('deleteProjectAttachment: database delete failed', {
        projectId,
        filePath,
        userId: user.id,
        error: dbError,
      })
      throw dbError
    }

    revalidatePath(`/app/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    logger.error('deleteProjectAttachment', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete file' }
  }
}
