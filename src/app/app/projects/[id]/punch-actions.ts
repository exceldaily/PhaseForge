'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { PunchStatus } from '@/types/app'

const PUNCH_BUCKET = 'project-attachments'
const EDITOR_ROLES = ['owner', 'admin', 'manager']

type ActionResult = { success: true } | { success: false; error: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

function punchPhotoPath(projectId: string, punchId: string, kind: 'issue' | 'completion') {
  return `punch-items/${projectId}/${punchId}/${kind}-photo-${Date.now()}.jpg`
}

async function notify(
  admin: ReturnType<typeof createAdminClient>,
  args: { userId: string; companyId: string; title: string; body: string; link: string }
) {
  try {
    await admin.from('notifications').insert({
      user_id: args.userId,
      company_id: args.companyId,
      type: 'mention',
      title: args.title,
      body: args.body,
      link: args.link,
    })
  } catch (err) {
    logger.error('punch notify', err)
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createPunchItem(
  projectId: string,
  data: {
    issuePhoto: File
    issue_description: string
    title?: string
    assigned_to?: string | null
    due_date?: string | null
    location?: string | null
    category?: string | null
    priority?: string | null
  }
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    if (!data.issuePhoto) return { success: false, error: 'An issue photo is required.' }
    if (!data.issue_description?.trim()) return { success: false, error: 'An issue description is required.' }

    const [{ data: profile }, { data: project }] = await Promise.all([
      supabase.from('profiles').select('company_id').eq('id', user.id).single(),
      supabase.from('projects').select('id, company_id, name').eq('id', projectId).single(),
    ])
    if (!project) throw new Error('Project not found')
    if (!profile?.company_id || profile.company_id !== project.company_id) {
      throw new Error('Not authorized for this project')
    }

    // Generate the id up front so the storage path and row id match.
    const punchId = crypto.randomUUID()
    const photoPath = punchPhotoPath(projectId, punchId, 'issue')

    const { error: uploadError } = await admin.storage
      .from(PUNCH_BUCKET)
      .upload(photoPath, data.issuePhoto, {
        contentType: data.issuePhoto.type || 'image/jpeg',
        upsert: false,
      })
    if (uploadError) {
      logger.error('createPunchItem: storage upload failed', { projectId, photoPath, error: uploadError })
      throw uploadError
    }

    // Next sequential number for this project.
    const { data: maxRow } = await admin
      .from('punch_items')
      .select('number')
      .eq('project_id', projectId)
      .order('number', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    const nextNumber = (maxRow?.number ?? 0) + 1

    const { error: dbError } = await admin.from('punch_items').insert({
      id: punchId,
      project_id: projectId,
      company_id: project.company_id,
      number: nextNumber,
      title: data.title?.trim() || null,
      issue_description: data.issue_description.trim(),
      issue_photo_path: photoPath,
      assigned_to: data.assigned_to || null,
      created_by: user.id,
      due_date: data.due_date || null,
      location: data.location?.trim() || null,
      category: data.category?.trim() || null,
      priority: data.priority || 'medium',
      status: 'open',
    })

    if (dbError) {
      logger.error('createPunchItem: db insert failed', { projectId, error: dbError })
      const { error: cleanupError } = await admin.storage.from(PUNCH_BUCKET).remove([photoPath])
      if (cleanupError) logger.warn('createPunchItem: orphan cleanup failed', { photoPath, cleanupError })
      throw dbError
    }

    // Notify assignee (not when self-assigned).
    if (data.assigned_to && data.assigned_to !== user.id) {
      await notify(admin, {
        userId: data.assigned_to,
        companyId: project.company_id,
        title: 'Punch item assigned to you',
        body: `#${nextNumber} — ${project.name}`,
        link: `/app/projects/${projectId}?tab=punch`,
      })
    }

    revalidatePath(`/app/projects/${projectId}`)
    return { success: true }
  } catch (err) {
    logger.error('createPunchItem', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create punch item' }
  }
}

// ── Update (status, assignment, fields) ──────────────────────────────────────

export async function updatePunchItem(
  punchId: string,
  updates: {
    status?: PunchStatus
    assigned_to?: string | null
    title?: string | null
    issue_description?: string
    due_date?: string | null
    location?: string | null
    category?: string | null
    priority?: string | null
  }
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles').select('company_id, role').eq('id', user.id).single()
    const { data: item } = await supabase
      .from('punch_items')
      .select('id, project_id, company_id, assigned_to, number, status')
      .eq('id', punchId)
      .single()
    if (!item) throw new Error('Punch item not found')
    if (!profile?.company_id || profile.company_id !== item.company_id) {
      throw new Error('Not authorized for this item')
    }

    const canEdit = EDITOR_ROLES.includes(profile.role) || item.assigned_to === user.id
    if (!canEdit) throw new Error('You can only update items assigned to you.')

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.status !== undefined) patch.status = updates.status
    if (updates.assigned_to !== undefined) patch.assigned_to = updates.assigned_to || null
    if (updates.title !== undefined) patch.title = updates.title?.trim() || null
    if (updates.issue_description !== undefined) patch.issue_description = updates.issue_description.trim()
    if (updates.due_date !== undefined) patch.due_date = updates.due_date || null
    if (updates.location !== undefined) patch.location = updates.location?.trim() || null
    if (updates.category !== undefined) patch.category = updates.category?.trim() || null
    if (updates.priority !== undefined) patch.priority = updates.priority || 'medium'

    const { error } = await admin.from('punch_items').update(patch).eq('id', punchId)
    if (error) throw error

    // Notify on new assignment.
    if (
      updates.assigned_to &&
      updates.assigned_to !== item.assigned_to &&
      updates.assigned_to !== user.id
    ) {
      const { data: project } = await admin
        .from('projects').select('name').eq('id', item.project_id).single()
      await notify(admin, {
        userId: updates.assigned_to,
        companyId: item.company_id,
        title: 'Punch item assigned to you',
        body: `#${item.number} — ${project?.name ?? 'Project'}`,
        link: `/app/projects/${item.project_id}?tab=punch`,
      })
    }

    revalidatePath(`/app/projects/${item.project_id}`)
    return { success: true }
  } catch (err) {
    logger.error('updatePunchItem', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update punch item' }
  }
}

// ── Complete (requires completion photo + description) ────────────────────────

export async function completePunchItem(
  punchId: string,
  data: { completionPhoto: File; completion_description: string }
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Hard requirements — completion is blocked without BOTH.
    if (!data.completionPhoto) return { success: false, error: 'A completion photo is required.' }
    if (!data.completion_description?.trim()) {
      return { success: false, error: 'A completion description is required.' }
    }

    const { data: profile } = await supabase
      .from('profiles').select('company_id, role').eq('id', user.id).single()
    const { data: item } = await supabase
      .from('punch_items')
      .select('id, project_id, company_id, assigned_to, created_by, number')
      .eq('id', punchId)
      .single()
    if (!item) throw new Error('Punch item not found')
    // Any member of the project's company can complete / upload a completion photo —
    // not just the assignee (crews share punch-out duties in the field).
    if (!profile?.company_id || profile.company_id !== item.company_id) {
      throw new Error('Not authorized for this item')
    }

    const photoPath = punchPhotoPath(item.project_id, punchId, 'completion')
    const { error: uploadError } = await admin.storage
      .from(PUNCH_BUCKET)
      .upload(photoPath, data.completionPhoto, {
        contentType: data.completionPhoto.type || 'image/jpeg',
        upsert: false,
      })
    if (uploadError) {
      logger.error('completePunchItem: storage upload failed', { punchId, photoPath, error: uploadError })
      throw uploadError
    }

    const { error } = await admin
      .from('punch_items')
      .update({
        status: 'completed',
        completion_photo_path: photoPath,
        completion_description: data.completion_description.trim(),
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', punchId)

    if (error) {
      const { error: cleanupError } = await admin.storage.from(PUNCH_BUCKET).remove([photoPath])
      if (cleanupError) logger.warn('completePunchItem: orphan cleanup failed', { photoPath, cleanupError })
      throw error
    }

    // Notify the creator (unless they completed it themselves).
    if (item.created_by && item.created_by !== user.id) {
      const { data: project } = await admin
        .from('projects').select('name').eq('id', item.project_id).single()
      await notify(admin, {
        userId: item.created_by,
        companyId: item.company_id,
        title: 'Punch item completed',
        body: `#${item.number} — ${project?.name ?? 'Project'}`,
        link: `/app/projects/${item.project_id}?tab=punch`,
      })
    }

    revalidatePath(`/app/projects/${item.project_id}`)
    return { success: true }
  } catch (err) {
    logger.error('completePunchItem', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to complete punch item' }
  }
}

// ── Delete (owner / admin only) ──────────────────────────────────────────────

export async function deletePunchItem(punchId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles').select('company_id, role').eq('id', user.id).single()
    const { data: item } = await supabase
      .from('punch_items')
      .select('id, project_id, company_id, issue_photo_path, completion_photo_path')
      .eq('id', punchId)
      .single()
    if (!item) throw new Error('Punch item not found')
    if (!profile?.company_id || profile.company_id !== item.company_id) {
      throw new Error('Not authorized for this item')
    }
    if (!['owner', 'admin'].includes(profile.role)) {
      throw new Error('Only owners and admins can delete punch items.')
    }

    const paths = [item.issue_photo_path, item.completion_photo_path].filter(Boolean) as string[]
    if (paths.length) {
      const { error: rmError } = await admin.storage.from(PUNCH_BUCKET).remove(paths)
      if (rmError) logger.warn('deletePunchItem: storage cleanup failed', { punchId, rmError })
    }

    const { error } = await admin.from('punch_items').delete().eq('id', punchId)
    if (error) throw error

    revalidatePath(`/app/projects/${item.project_id}`)
    return { success: true }
  } catch (err) {
    logger.error('deletePunchItem', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete punch item' }
  }
}
