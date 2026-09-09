'use server'

// Employee directory: the company's people whether or not they log in.
// Managers and up edit; everyone in the company can read.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canEditCompanyData } from '@/lib/permissions'
import { defaultScheduleName, inferState, matchEmployee, placeFromJobTitle, type ParsedEmployeeRow } from '@/lib/travel/geo'
import { geocodeAddress, pace } from '@/lib/travel/geocode'
import { sendInvite } from '@/app/app/settings/members/actions'

const PATH = '/app/employees'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase.from('profiles').select('company_id, ops_role, role').eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  if (!canEditCompanyData(p)) throw new Error('Managers and up only')
  return { supabase, userId: user.id, companyId: p.company_id as string }
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : 'Failed' })

const clean = (s: string | null | undefined) => (s ?? '').trim() || null

export async function createEmployee(input: {
  name: string; scheduleName?: string | null; email?: string | null; phone?: string | null
  address?: string | null; superintendentId?: string | null
}): Promise<Result<{ id: string }>> {
  try {
    const { supabase, userId, companyId } = await ctx()
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Give them a name.' }
    const address = clean(input.address)
    const geo = address ? await geocodeAddress(address) : null
    const { data, error } = await supabase.from('employees').insert({
      company_id: companyId, created_by: userId, name,
      schedule_name: clean(input.scheduleName) ?? defaultScheduleName(name),
      email: clean(input.email)?.toLowerCase() ?? null, phone: clean(input.phone), address,
      latitude: geo?.lat ?? null, longitude: geo?.lng ?? null,
      geocoded_at: address ? new Date().toISOString() : null,
      geocode_error: address && !geo ? 'Address not found' : null,
      superintendent_id: input.superintendentId || null,
    }).select('id').single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not add them.' }
    revalidatePath(PATH)
    return { ok: true, id: data.id as string }
  } catch (e) { return fail(e) }
}

export async function updateEmployee(input: {
  id: string
  patch: Partial<{
    name: string; schedule_name: string | null; email: string | null; phone: string | null
    address: string | null; superintendent_id: string | null; is_active: boolean; notes: string | null
  }>
}): Promise<Result> {
  try {
    const { supabase, companyId } = await ctx()
    const allowed = ['name', 'schedule_name', 'email', 'phone', 'address', 'superintendent_id', 'is_active', 'notes'] as const
    const patch: Record<string, unknown> = {}
    for (const k of allowed) if (k in input.patch) patch[k] = input.patch[k]
    if ('name' in patch && !String(patch.name).trim()) return { ok: false, error: 'A name is required.' }
    if ('email' in patch) patch.email = clean(patch.email as string)?.toLowerCase() ?? null
    if ('superintendent_id' in patch) patch.superintendent_id = patch.superintendent_id || null
    if ('address' in patch) {
      const address = clean(patch.address as string)
      patch.address = address
      const geo = address ? await geocodeAddress(address) : null
      patch.latitude = geo?.lat ?? null
      patch.longitude = geo?.lng ?? null
      patch.geocoded_at = address ? new Date().toISOString() : null
      patch.geocode_error = address && !geo ? 'Address not found' : null
    }
    if (!Object.keys(patch).length) return { ok: true }
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase.from('employees').update(patch).eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteEmployee(input: { id: string }): Promise<Result> {
  try {
    const { supabase, companyId } = await ctx()
    const { error } = await supabase.from('employees').delete().eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) { return fail(e) }
}

/**
 * Bulk add from a pasted directory. Names already on the list are updated
 * with any address, phone, or email the paste carries, never duplicated.
 * Addresses are located afterwards by locateMissing, in paced batches.
 */
export async function importEmployees(input: { rows: ParsedEmployeeRow[] }): Promise<Result<{ added: number; updated: number }>> {
  try {
    const { supabase, userId, companyId } = await ctx()
    const [{ data: existing }, { data: teams }] = await Promise.all([
      supabase.from('employees').select('id, name, address, phone, email, superintendent_id').eq('company_id', companyId),
      supabase.from('superintendents').select('id, name').eq('company_id', companyId).eq('is_active', true),
    ])
    const teamId = new Map((teams ?? []).map((t) => [t.name.trim().toLowerCase(), t.id]))
    const byName = new Map((existing ?? []).map((e) => [e.name.trim().toLowerCase(), e]))
    let added = 0, updated = 0
    const inserts: Record<string, unknown>[] = []
    const seen = new Set<string>()

    for (const r of input.rows) {
      const name = r.name.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const sup = r.team ? teamId.get(r.team.trim().toLowerCase()) ?? null : null
      const cur = byName.get(key)
      if (cur) {
        const patch: Record<string, unknown> = {}
        if (r.address && r.address !== cur.address) { patch.address = r.address; patch.latitude = null; patch.longitude = null; patch.geocoded_at = null; patch.geocode_error = null }
        if (r.phone && !cur.phone) patch.phone = r.phone
        if (r.email && !cur.email) patch.email = r.email
        if (sup && !cur.superintendent_id) patch.superintendent_id = sup
        if (Object.keys(patch).length) {
          patch.updated_at = new Date().toISOString()
          await supabase.from('employees').update(patch).eq('id', cur.id).eq('company_id', companyId)
          updated++
        }
        continue
      }
      inserts.push({
        company_id: companyId, created_by: userId, name,
        schedule_name: defaultScheduleName(name),
        email: r.email, phone: r.phone, address: r.address, superintendent_id: sup,
      })
    }
    if (inserts.length) {
      const { error } = await supabase.from('employees').insert(inserts)
      if (error) return { ok: false, error: error.message }
      added = inserts.length
    }
    revalidatePath(PATH)
    return { ok: true, added, updated }
  } catch (e) { return fail(e) }
}

/**
 * Locate a batch of addresses that have no coordinates yet: employees first,
 * then schedule directory jobs. Paced at one lookup a second (the geocoder's
 * rule), so the button reports how many are left and is pressed again.
 */
export async function locateMissing(input?: { limit?: number }): Promise<Result<{ done: number; found: number; remaining: number }>> {
  try {
    const { supabase, companyId } = await ctx()
    const limit = Math.min(20, Math.max(1, input?.limit ?? 12))
    const [{ data: emps }, { data: jobs }, { data: allEmps }] = await Promise.all([
      supabase.from('employees').select('id, address').eq('company_id', companyId)
        .not('address', 'is', null).is('geocoded_at', null).limit(limit),
      supabase.from('schedule_directory').select('id, title, address').eq('company_id', companyId).is('geocoded_at', null).limit(limit),
      supabase.from('employees').select('address').eq('company_id', companyId).not('address', 'is', null),
    ])
    const state = inferState((allEmps ?? []).map((e) => e.address))
    let done = 0, found = 0
    const queue: { table: 'employees' | 'schedule_directory'; id: string; query: string | null }[] = [
      ...(emps ?? []).map((e) => ({ table: 'employees' as const, id: e.id, query: e.address as string })),
      ...(jobs ?? []).map((j) => {
        const place = j.address?.trim() || placeFromJobTitle(j.title)
        return { table: 'schedule_directory' as const, id: j.id, query: place ? (j.address?.trim() ? place : `${place}${state ? `, ${state}` : ''}`) : null }
      }),
    ].slice(0, limit)

    for (const item of queue) {
      if (done > 0) await pace()
      const hit = item.query ? await geocodeAddress(item.query) : null
      await supabase.from(item.table).update({
        latitude: hit?.lat ?? null, longitude: hit?.lng ?? null,
        geocoded_at: new Date().toISOString(),
        geocode_error: hit ? null : (item.query ? 'Address not found' : 'No address'),
      }).eq('id', item.id).eq('company_id', companyId)
      done++
      if (hit) found++
    }

    const [{ count: e }, { count: j }] = await Promise.all([
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).not('address', 'is', null).is('geocoded_at', null),
      supabase.from('schedule_directory').select('id', { count: 'exact', head: true }).eq('company_id', companyId).is('geocoded_at', null),
    ])
    revalidatePath(PATH)
    revalidatePath('/app/schedules')
    return { ok: true, done, found, remaining: (e ?? 0) + (j ?? 0) }
  } catch (e) { return fail(e) }
}

/** Clear a failed lookup so it is tried again (after fixing the address). */
export async function retryLocate(input: { table: 'employees' | 'schedule_directory'; id: string }): Promise<Result> {
  try {
    const { supabase, companyId } = await ctx()
    const { error } = await supabase.from(input.table).update({ geocoded_at: null, geocode_error: null })
      .eq('id', input.id).eq('company_id', companyId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** Send a PhaseForge invite to an employee and remember that we did. */
export async function inviteEmployee(input: { id: string; email: string }): Promise<Result<{ message: string | null }>> {
  try {
    const { supabase, companyId } = await ctx()
    const email = input.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'That does not look like an email address.' }
    const res = await sendInvite(companyId, email, 'member')
    if (res.error) return { ok: false, error: res.error }
    await supabase.from('employees').update({ email, invited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', input.id).eq('company_id', companyId)
    revalidatePath(PATH)
    return { ok: true, message: res.message ?? null }
  } catch (e) { return fail(e) }
}

/** Put an employee on (or take them off) their team's schedule roster. */
export async function setOnSchedule(input: { id: string; on: boolean }): Promise<Result> {
  try {
    const { supabase, companyId } = await ctx()
    const { data: emp } = await supabase.from('employees').select('name, schedule_name, superintendent_id')
      .eq('id', input.id).eq('company_id', companyId).single()
    if (!emp) return { ok: false, error: 'Employee not found.' }
    if (!emp.superintendent_id) return { ok: false, error: 'Give them a team first.' }
    const { data: sup } = await supabase.from('superintendents').select('roster').eq('id', emp.superintendent_id).eq('company_id', companyId).single()
    const roster = ((sup?.roster as string[] | null) ?? [])
    const short = (emp.schedule_name ?? defaultScheduleName(emp.name)).trim()
    const next = input.on
      ? (roster.some((r) => r.toLowerCase() === short.toLowerCase()) ? roster : [...roster, short])
      : roster.filter((r) => r.toLowerCase() !== short.toLowerCase())
    const { error } = await supabase.from('superintendents').update({ roster: next }).eq('id', emp.superintendent_id).eq('company_id', companyId)
    if (error) return { ok: false, error: error.message }
    revalidatePath(PATH)
    revalidatePath('/app/schedules')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/**
 * Walk every team's roster and set schedule_name on the employee each short
 * name refers to, so "John M" on the schedule is pinned to John Mitchell.
 */
export async function matchRosterNames(): Promise<Result<{ matched: number; unmatched: string[] }>> {
  try {
    const { supabase, companyId } = await ctx()
    const [{ data: emps }, { data: sups }] = await Promise.all([
      supabase.from('employees').select('id, name, schedule_name, superintendent_id').eq('company_id', companyId).eq('is_active', true),
      supabase.from('superintendents').select('id, name, roster').eq('company_id', companyId).eq('is_active', true),
    ])
    const list = (emps ?? []).map((e) => ({ ...e, schedule_name: e.schedule_name as string | null }))
    let matched = 0
    const unmatched: string[] = []
    const taken = new Set<string>()
    for (const s of sups ?? []) {
      for (const short of (s.roster as string[] | null) ?? []) {
        const emp = matchEmployee(short, list, s.id)
        if (!emp || taken.has(emp.id)) { unmatched.push(`${short} (${s.name})`); continue }
        taken.add(emp.id)
        if (emp.schedule_name !== short || emp.superintendent_id !== s.id) {
          await supabase.from('employees').update({ schedule_name: short, superintendent_id: emp.superintendent_id ?? s.id, updated_at: new Date().toISOString() })
            .eq('id', emp.id).eq('company_id', companyId)
          emp.schedule_name = short
        }
        matched++
      }
    }
    revalidatePath(PATH)
    return { ok: true, matched, unmatched }
  } catch (e) { return fail(e) }
}
