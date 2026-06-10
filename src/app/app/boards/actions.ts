'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBoardLimit } from '@/lib/planLimits'
import { BOARD_COLUMN_MIN, BOARD_COLUMN_MAX, DEFAULT_BOARD_COLUMNS } from '@/lib/constants'
import { logger } from '@/lib/logger'

// Supabase/Postgres errors are plain objects, not Error instances, so a bare
// `err.message` check swallows them into a generic fallback. Pull out whatever
// detail we can so the UI shows the real cause.
function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string }
    const parts = [e.message, e.details, e.hint].filter(Boolean)
    if (parts.length) return parts.join(' — ') + (e.code ? ` (${e.code})` : '')
  }
  return fallback
}

async function requireRole(roles: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role, company_id').eq('id', user.id).single()
  if (!profile || !roles.includes(profile.role)) throw new Error('Not authorized')
  return { supabase, userId: user.id, companyId: profile.company_id as string, role: profile.role }
}

// ── Board CRUD ────────────────────────────────────────────────────────────────

export async function createBoard(formData: FormData) {
  try {
    const { userId, companyId } = await requireRole(['owner', 'admin', 'manager'])
    const name  = String(formData.get('name') ?? '').trim()
    const color = String(formData.get('color') ?? '#6366f1')
    const description = String(formData.get('description') ?? '').trim() || null

    if (!name) throw new Error('Board name is required')

    const usage = await checkBoardLimit(companyId)
    if (!usage.allowed) throw new Error(usage.reason)

    // Role + company are already authorized above via requireRole(). Perform the
    // writes with the service-role client (scoped to the validated companyId) to
    // avoid brittle RLS edge cases on insert. Mirrors the signup/invite pattern.
    const admin = createAdminClient()

    const { data: board, error: boardError } = await admin
      .from('boards')
      .insert({ company_id: companyId, name, description, color, created_by: userId })
      .select()
      .single()
    if (boardError) throw boardError

    // Seed with default columns
    const cols = DEFAULT_BOARD_COLUMNS.map((c, i) => ({
      board_id: board.id,
      name: c.name,
      color: c.color,
      sort_order: i,
      is_done: c.is_done,
    }))
    const { error: colError } = await admin.from('board_columns').insert(cols)
    if (colError) throw colError

    revalidatePath('/app/boards')
    return { success: true, boardId: board.id }
  } catch (err) {
    logger.error('createBoard', err)
    return { success: false, error: errMessage(err, 'Failed to create board') }
  }
}

export async function updateBoard(boardId: string, updates: { name?: string; description?: string; color?: string }) {
  try {
    const { supabase } = await requireRole(['owner', 'admin'])
    const { error } = await supabase
      .from('boards')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', boardId)
    if (error) throw error
    revalidatePath('/app/boards')
    revalidatePath(`/app/boards/${boardId}`)
    return { success: true }
  } catch (err) {
    logger.error('updateBoard', err)
    return { success: false, error: errMessage(err, 'Failed to update board') }
  }
}

export async function deleteBoard(boardId: string) {
  try {
    const { supabase, companyId } = await requireRole(['owner', 'admin'])
    const { data: board } = await supabase.from('boards').select('is_default').eq('id', boardId).single()
    if (board?.is_default) throw new Error('Cannot delete the default board')
    await supabase.from('boards').delete().eq('id', boardId).eq('company_id', companyId)
    revalidatePath('/app/boards')
    return { success: true }
  } catch (err) {
    logger.error('deleteBoard', err)
    return { success: false, error: errMessage(err, 'Failed to delete board') }
  }
}

// ── Column CRUD ───────────────────────────────────────────────────────────────

export async function addBoardColumn(boardId: string, data: { name: string; color: string }) {
  try {
    const { supabase } = await requireRole(['owner', 'admin', 'manager'])

    const { count } = await supabase
      .from('board_columns')
      .select('*', { count: 'exact', head: true })
      .eq('board_id', boardId)
    if ((count ?? 0) >= BOARD_COLUMN_MAX)
      throw new Error(`Boards support a maximum of ${BOARD_COLUMN_MAX} columns`)

    const { data: maxRow } = await supabase
      .from('board_columns')
      .select('sort_order')
      .eq('board_id', boardId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const sort_order = (maxRow?.sort_order ?? -1) + 1
    const { data: col, error } = await supabase
      .from('board_columns')
      .insert({ board_id: boardId, name: data.name.trim(), color: data.color, sort_order })
      .select()
      .single()
    if (error) throw error

    revalidatePath(`/app/boards/${boardId}/settings`)
    return { success: true, column: col }
  } catch (err) {
    logger.error('addBoardColumn', err)
    return { success: false, error: errMessage(err, 'Failed to add column') }
  }
}

export async function updateBoardColumn(columnId: string, updates: { name?: string; color?: string; is_done?: boolean }) {
  try {
    const { supabase } = await requireRole(['owner', 'admin', 'manager'])
    const { error } = await supabase.from('board_columns').update(updates).eq('id', columnId)
    if (error) throw error
    return { success: true }
  } catch (err) {
    logger.error('updateBoardColumn', err)
    return { success: false, error: errMessage(err, 'Failed to update column') }
  }
}

export async function deleteBoardColumn(columnId: string, boardId: string) {
  try {
    const { supabase } = await requireRole(['owner', 'admin'])

    const { count } = await supabase
      .from('board_columns')
      .select('*', { count: 'exact', head: true })
      .eq('board_id', boardId)
    if ((count ?? 0) <= BOARD_COLUMN_MIN)
      throw new Error(`Boards require a minimum of ${BOARD_COLUMN_MIN} columns`)

    // Move projects in this column to the first remaining column
    const { data: firstCol } = await supabase
      .from('board_columns')
      .select('id')
      .eq('board_id', boardId)
      .neq('id', columnId)
      .order('sort_order')
      .limit(1)
      .single()

    if (firstCol) {
      await supabase
        .from('projects')
        .update({ board_column_id: firstCol.id })
        .eq('board_column_id', columnId)
    }

    await supabase.from('board_columns').delete().eq('id', columnId)
    revalidatePath(`/app/boards/${boardId}/settings`)
    return { success: true }
  } catch (err) {
    logger.error('deleteBoardColumn', err)
    return { success: false, error: errMessage(err, 'Failed to delete column') }
  }
}

export async function reorderBoardColumns(boardId: string, orderedIds: string[]) {
  try {
    const { supabase } = await requireRole(['owner', 'admin', 'manager'])
    const updates = orderedIds.map((id, i) =>
      supabase.from('board_columns').update({ sort_order: i }).eq('id', id).eq('board_id', boardId)
    )
    await Promise.all(updates)
    return { success: true }
  } catch (err) {
    logger.error('reorderBoardColumns', err)
    return { success: false, error: errMessage(err, 'Failed to reorder columns') }
  }
}

// ── Project column assignment ─────────────────────────────────────────────────

export async function moveProjectToColumn(projectId: string, columnId: string) {
  try {
    const { supabase, userId } = await requireRole(['owner', 'admin', 'manager'])
    const { error } = await supabase
      .from('projects')
      .update({ board_column_id: columnId, updated_at: new Date().toISOString(), updated_by: userId })
      .eq('id', projectId)
    if (error) throw error
    return { success: true }
  } catch (err) {
    logger.error('moveProjectToColumn', err)
    return { success: false, error: errMessage(err, 'Failed to move project') }
  }
}

// ── Board ↔ Team ──────────────────────────────────────────────────────────────

export async function addBoardTeam(boardId: string, teamId: string) {
  try {
    const { supabase } = await requireRole(['owner', 'admin'])
    await supabase.from('board_teams').insert({ board_id: boardId, team_id: teamId })
    revalidatePath(`/app/boards/${boardId}/settings`)
    return { success: true }
  } catch (err) {
    logger.error('addBoardTeam', err)
    return { success: false, error: errMessage(err, 'Failed to add team') }
  }
}

export async function removeBoardTeam(boardId: string, teamId: string) {
  try {
    const { supabase } = await requireRole(['owner', 'admin'])
    await supabase.from('board_teams').delete().eq('board_id', boardId).eq('team_id', teamId)
    revalidatePath(`/app/boards/${boardId}/settings`)
    return { success: true }
  } catch (err) {
    logger.error('removeBoardTeam', err)
    return { success: false, error: errMessage(err, 'Failed to remove team') }
  }
}
