'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

export async function addPhaseChecklist(phaseId: string, title: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: checklist, error } = await supabase
      .from('phase_checklists')
      .insert({
        phase_id: phaseId,
        title: title.trim(),
        is_completed: false,
        sort_order: 0,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/app/projects`)
    return { success: true, checklist }
  } catch (err) {
    logger.error('addPhaseChecklist', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add checklist' }
  }
}

export async function updatePhaseChecklist(checklistId: string, updates: { is_completed?: boolean; title?: string }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('phase_checklists')
      .update(updates)
      .eq('id', checklistId)

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
    const { error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', projectId)

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: project } = await supabase.from('projects').select('company_id').eq('id', projectId).single()
    if (!project) throw new Error('Project not found')

    const timestamp = Date.now()
    const filename = `${timestamp}-${file.name}`
    const filePath = `projects/${projectId}/${filename}`

    const { error: uploadError } = await supabase.storage
      .from('project-attachments')
      .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('project-attachments')
      .getPublicUrl(filePath)

    const { error: dbError } = await supabase
      .from('project_attachments')
      .insert({
        project_id: projectId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user.id,
        uploaded_at: new Date().toISOString(),
      })

    if (dbError) throw dbError

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error: storageError } = await supabase.storage
      .from('project-attachments')
      .remove([filePath])

    if (storageError) throw storageError

    const { error: dbError } = await supabase
      .from('project_attachments')
      .delete()
      .eq('project_id', projectId)
      .eq('file_path', filePath)

    if (dbError) throw dbError

    revalidatePath(`/app/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    logger.error('deleteProjectAttachment', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete file' }
  }
}
