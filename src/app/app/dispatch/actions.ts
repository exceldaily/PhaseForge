'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function requireDispatchAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) throw new Error('No company')

  const { data: company } = await supabase
    .from('companies')
    .select('dispatch_enabled')
    .eq('id', profile.company_id)
    .single()

  if (!company?.dispatch_enabled) throw new Error('Dispatch not enabled for this organization')

  return { supabase, userId: user.id, companyId: profile.company_id, role: profile.role }
}

async function requireDispatchManager() {
  const ctx = await requireDispatchAccess()
  if (!['owner', 'admin', 'manager'].includes(ctx.role)) throw new Error('Not authorized')
  return ctx
}

// ── Activity log helper ───────────────────────────────────────────────────────

async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    cardId: string
    companyId: string
    userId: string
    actorName?: string
    activityType: string
    message: string
    fieldName?: string
    oldValue?: string
    newValue?: string
  }
) {
  await supabase.from('dispatch_activity_logs').insert({
    card_id: opts.cardId,
    company_id: opts.companyId,
    actor_type: 'user',
    actor_id: opts.userId,
    actor_name: opts.actorName ?? null,
    activity_type: opts.activityType,
    message: opts.message,
    field_name: opts.fieldName ?? null,
    old_value: opts.oldValue ?? null,
    new_value: opts.newValue ?? null,
  })
}

// ── Board CRUD ────────────────────────────────────────────────────────────────

export async function createDispatchBoard(formData: FormData) {
  try {
    const { supabase, userId, companyId } = await requireDispatchManager()

    const name = String(formData.get('name') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim() || null
    const columnsJson = String(formData.get('columns') ?? '[]')

    if (!name) return { error: 'Board name is required' }

    let columnDefs: Array<{ name: string; color: string; is_done: boolean }> = []
    try {
      columnDefs = JSON.parse(columnsJson)
    } catch {
      return { error: 'Invalid column data' }
    }

    if (columnDefs.length < 1) return { error: 'At least one column is required' }

    const { data: board, error: boardErr } = await supabase
      .from('dispatch_boards')
      .insert({ company_id: companyId, name, description, created_by: userId })
      .select()
      .single()

    if (boardErr || !board) return { error: boardErr?.message ?? 'Failed to create board' }

    // Insert columns
    const colRows = columnDefs.map((c, i) => ({
      board_id: board.id,
      company_id: companyId,
      name: c.name,
      color: c.color || '#94a3b8',
      sort_order: i,
      is_done: c.is_done ?? false,
    }))

    const { error: colErr } = await supabase.from('dispatch_columns').insert(colRows)
    if (colErr) return { error: colErr.message }

    revalidatePath('/app/dispatch')
    return { boardId: board.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateDispatchBoard(boardId: string, updates: { name?: string; description?: string; is_active?: boolean }) {
  try {
    const { supabase, companyId } = await requireDispatchManager()

    const { error } = await supabase
      .from('dispatch_boards')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', boardId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    revalidatePath('/app/dispatch')
    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteDispatchBoard(boardId: string) {
  try {
    const { supabase, companyId, role } = await requireDispatchAccess()
    if (!['owner', 'admin'].includes(role)) return { error: 'Only admins can delete boards' }

    const { error } = await supabase
      .from('dispatch_boards')
      .delete()
      .eq('id', boardId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    revalidatePath('/app/dispatch')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ── Column CRUD ───────────────────────────────────────────────────────────────

export async function createDispatchColumn(boardId: string, name: string, color = '#94a3b8', isDone = false) {
  try {
    const { supabase, companyId } = await requireDispatchManager()

    const { data: existing } = await supabase
      .from('dispatch_columns')
      .select('sort_order')
      .eq('board_id', boardId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = ((existing?.[0]?.sort_order ?? -1) + 1)

    const { error } = await supabase.from('dispatch_columns').insert({
      board_id: boardId,
      company_id: companyId,
      name: name.trim(),
      color,
      sort_order: nextOrder,
      is_done: isDone,
    })

    if (error) return { error: error.message }

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateDispatchColumn(columnId: string, boardId: string, updates: { name?: string; color?: string; is_done?: boolean; sort_order?: number }) {
  try {
    const { supabase, companyId } = await requireDispatchManager()

    const { error } = await supabase
      .from('dispatch_columns')
      .update(updates)
      .eq('id', columnId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteDispatchColumn(columnId: string, boardId: string) {
  try {
    const { supabase, companyId } = await requireDispatchManager()

    // Move any cards in this column to null (unassigned)
    await supabase
      .from('dispatch_cards')
      .update({ column_id: null })
      .eq('column_id', columnId)
      .eq('company_id', companyId)

    const { error } = await supabase
      .from('dispatch_columns')
      .delete()
      .eq('id', columnId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ── Card CRUD ─────────────────────────────────────────────────────────────────

export async function createDispatchCard(formData: FormData) {
  try {
    const { supabase, userId, companyId } = await requireDispatchAccess()

    const boardId   = String(formData.get('boardId') ?? '').trim()
    const columnId  = String(formData.get('columnId') ?? '').trim() || null
    const store     = String(formData.get('store') ?? '').trim() || null
    const urgency   = String(formData.get('urgency') ?? 'medium')
    const scNumber  = String(formData.get('sc_number') ?? '').trim() || null
    const kalosJob  = String(formData.get('kalos_job_number') ?? '').trim() || null
    const desc      = String(formData.get('description') ?? '').trim() || null
    const dateStart = String(formData.get('date_started') ?? '').trim() || null
    const who       = String(formData.get('who_ordered') ?? '').trim() || null

    if (!boardId) return { error: 'Board ID required' }

    const { data: card, error } = await supabase
      .from('dispatch_cards')
      .insert({
        company_id: companyId,
        board_id: boardId,
        column_id: columnId,
        store,
        urgency,
        sc_number: scNumber,
        kalos_job_number: kalosJob,
        description: desc,
        date_started: dateStart || null,
        who_ordered: who,
        source: 'manual',
        created_by: userId,
      })
      .select()
      .single()

    if (error || !card) return { error: error?.message ?? 'Failed to create card' }

    await logActivity(supabase, {
      cardId: card.id,
      companyId,
      userId,
      activityType: 'card_created',
      message: 'Card created',
    })

    revalidatePath(`/app/dispatch/${boardId}`)
    return { cardId: card.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateDispatchCard(cardId: string, boardId: string, updates: Record<string, unknown>, changeLog?: { field: string; label: string; oldValue: string; newValue: string }[]) {
  try {
    const { supabase, userId, companyId } = await requireDispatchAccess()

    const { error } = await supabase
      .from('dispatch_cards')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    // Log each changed field
    for (const change of changeLog ?? []) {
      if (change.oldValue !== change.newValue) {
        await logActivity(supabase, {
          cardId,
          companyId,
          userId,
          activityType: 'field_changed',
          message: `${change.label} updated`,
          fieldName: change.field,
          oldValue: change.oldValue || undefined,
          newValue: change.newValue || undefined,
        })
      }
    }

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function moveDispatchCard(cardId: string, boardId: string, newColumnId: string | null, newColumnName: string, oldColumnName: string) {
  try {
    const { supabase, userId, companyId } = await requireDispatchAccess()

    const { error } = await supabase
      .from('dispatch_cards')
      .update({ column_id: newColumnId, updated_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    await logActivity(supabase, {
      cardId,
      companyId,
      userId,
      activityType: 'status_changed',
      message: `Moved from "${oldColumnName}" to "${newColumnName}"`,
      fieldName: 'column',
      oldValue: oldColumnName,
      newValue: newColumnName,
    })

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function closeDispatchCard(cardId: string, boardId: string) {
  try {
    const { supabase, userId, companyId } = await requireDispatchAccess()

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('dispatch_cards')
      .update({ closed_at: now, updated_at: now })
      .eq('id', cardId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    await logActivity(supabase, {
      cardId,
      companyId,
      userId,
      activityType: 'card_closed',
      message: 'Card closed',
    })

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function reopenDispatchCard(cardId: string, boardId: string) {
  try {
    const { supabase, userId, companyId } = await requireDispatchAccess()

    const { error } = await supabase
      .from('dispatch_cards')
      .update({ closed_at: null, updated_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    await logActivity(supabase, {
      cardId,
      companyId,
      userId,
      activityType: 'card_reopened',
      message: 'Card reopened',
    })

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteDispatchCard(cardId: string, boardId: string) {
  try {
    const { supabase, companyId } = await requireDispatchManager()

    const { error } = await supabase
      .from('dispatch_cards')
      .delete()
      .eq('id', cardId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ── Activity notes ────────────────────────────────────────────────────────────

export async function addDispatchNote(cardId: string, boardId: string, message: string) {
  try {
    const { supabase, userId, companyId } = await requireDispatchAccess()

    const msg = message.trim()
    if (!msg) return { error: 'Note cannot be empty' }

    await logActivity(supabase, {
      cardId,
      companyId,
      userId,
      activityType: 'note_added',
      message: msg,
    })

    revalidatePath(`/app/dispatch/${boardId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function getDispatchActivity(cardId: string) {
  try {
    const { supabase, companyId } = await requireDispatchAccess()

    const { data, error } = await supabase
      .from('dispatch_activity_logs')
      .select(`*, actor:profiles!dispatch_activity_logs_actor_id_fkey(id, full_name, avatar_url)`)
      .eq('card_id', cardId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })

    if (error) return { error: error.message }
    return { logs: data ?? [] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ── Vendor CRUD ───────────────────────────────────────────────────────────────

export async function createDispatchVendor(formData: FormData) {
  try {
    const { supabase, companyId } = await requireDispatchManager()

    const name  = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim() || null
    const phone = String(formData.get('phone') ?? '').trim() || null
    const notes = String(formData.get('notes') ?? '').trim() || null

    if (!name) return { error: 'Vendor name is required' }

    const { data, error } = await supabase
      .from('dispatch_vendors')
      .insert({ company_id: companyId, name, email, phone, notes })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath('/app/dispatch')
    return { vendor: data }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateDispatchVendor(vendorId: string, updates: { name?: string; email?: string; phone?: string; notes?: string; is_active?: boolean }) {
  try {
    const { supabase, companyId } = await requireDispatchManager()

    const { error } = await supabase
      .from('dispatch_vendors')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', vendorId)
      .eq('company_id', companyId)

    if (error) return { error: error.message }

    revalidatePath('/app/dispatch')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
