import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { canUseTickets } from '@/lib/constants'
import type {
  CallNote, CallWithRelations, Customer, DispatchAsset, DispatchFormField, PriorityLevel, Store, Vendor,
} from '@/lib/dispatch/types'
import type { OnCallParticipant, OnCallSettings } from '@/lib/dispatch/onCall'

export interface DispatchContext {
  allowed: boolean
  canEdit: boolean
  companyId: string | null
}

// Resolves access + role for the signed-in user. RLS scopes every query to
// the caller's company, so fetchers below don't re-filter by company_id.
export async function getDispatchContext(): Promise<DispatchContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { allowed: false, canEdit: false, companyId: null }
  const { data: p } = await supabase
    .from('profiles')
    .select('company_id, ops_role, role, companies(plan, dispatch_enabled)')
    .eq('id', user.id).single()
  if (!p?.company_id) return { allowed: false, canEdit: false, companyId: null }
  const co = p.companies as { plan?: string; dispatch_enabled?: boolean } | null
  const allowed = canUseTickets(co?.plan) || Boolean(co?.dispatch_enabled)
  const canEdit = ['owner', 'admin', 'manager', 'dispatcher'].includes(p.ops_role ?? '') ||
    ['owner', 'admin'].includes(p.role ?? '')
  return { allowed, canEdit, companyId: p.company_id }
}

export interface DispatchData {
  stores: Store[]
  vendors: Vendor[]
  customers: Customer[]
  assets: DispatchAsset[]
  priorityLevels: PriorityLevel[]
  formFields: DispatchFormField[]
  // Built-in call-card fields this org removed from its forms (e.g. rack_circuit_case).
  hiddenBuiltinFields: string[]
  calls: CallWithRelations[]
}

export async function getDispatchData(): Promise<DispatchData> {
  const supabase = await createClient()
  const [storesRes, vendorsRes, customersRes, assetsRes, levelsRes, fieldsRes, settingsRes, callsRes] = await Promise.all([
    supabase.from('dispatch_stores').select('*').order('store_number'),
    supabase.from('dispatch_techs').select('*').order('name'),
    // Shared with the Customers page — one customer list drives both.
    supabase.from('customers').select('id, company_id, name, created_at').order('name'),
    // The customers' equipment database — powers the "which unit is broken" picker.
    supabase.from('assets').select('id, customer_id, name, asset_type, make, model, status').order('name'),
    supabase.from('dispatch_priority_levels').select('*').order('sort_order'),
    supabase.from('dispatch_form_fields').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('dispatch_company_settings').select('hidden_builtin_fields').maybeSingle(),
    supabase.from('dispatch_service_calls').select(
      '*, store:dispatch_stores(*, customer:customers(name)), ' +
      'customer:customers(name), ' +
      'priority_level:dispatch_priority_levels(*), ' +
      'notes:dispatch_call_notes(*, user:profiles(id, full_name, email)), ' +
      'activity:dispatch_call_activity(*), ' +
      'vendor_assignments:dispatch_call_vendors(vendor:dispatch_techs(*))',
    ).order('date_started', { ascending: false }),
  ])

  // The dynamic multi-join select string defeats supabase-js's type parser,
  // so rows come back untyped and are shaped explicitly here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCalls = (callsRes.data ?? []) as any[]
  const calls: CallWithRelations[] = rawCalls.map((call) => {
    const notes = ([...(call.notes ?? [])] as CallNote[]).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    const activity = [...(call.activity ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    const vendors = ((call.vendor_assignments ?? []) as { vendor: Vendor | null }[])
      .map((a) => a.vendor)
      .filter((v): v is Vendor => !!v)
      .sort((a, b) => (a.id === call.assigned_vendor_id ? -1 : b.id === call.assigned_vendor_id ? 1 : 0))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- raw joins replaced by flat fields
    const { vendor_assignments, customer, ...rest } = call
    // Direct customer (store-less calls) falls back to the store's customer.
    const customer_name =
      (customer as { name?: string } | null)?.name ??
      (call.store as { customer?: { name?: string } | null } | null)?.customer?.name ?? null
    return {
      ...rest, customer_name,
      custom_fields: (call.custom_fields ?? {}) as Record<string, string>,
      vendor: vendors[0] ?? null, vendors, notes, activity, latest_note: notes[0] ?? null,
    } as CallWithRelations
  })

  return {
    stores: (storesRes.data ?? []) as Store[],
    vendors: (vendorsRes.data ?? []) as Vendor[],
    customers: (customersRes.data ?? []) as Customer[],
    assets: (assetsRes.data ?? []) as DispatchAsset[],
    priorityLevels: (levelsRes.data ?? []) as PriorityLevel[],
    formFields: (fieldsRes.data ?? []) as DispatchFormField[],
    hiddenBuiltinFields: settingsRes.data?.hidden_builtin_fields ?? [],
    calls,
  }
}

export async function getOnCallData(): Promise<{ participants: OnCallParticipant[]; settings: OnCallSettings | null }> {
  const supabase = await createClient()
  const [participantsRes, settingsRes] = await Promise.all([
    supabase.from('dispatch_on_call_participants').select('*').order('sort_order'),
    supabase.from('dispatch_on_call_settings').select('*').maybeSingle(),
  ])
  return {
    participants: (participantsRes.data ?? []) as OnCallParticipant[],
    settings: (settingsRes.data ?? null) as OnCallSettings | null,
  }
}

// The tech record belonging to the signed-in member. Falls back to a one-time
// auto-claim when an unclaimed tech row carries the member's email.
export async function getMyTech(): Promise<Vendor | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: byProfile } = await supabase.from('dispatch_techs')
    .select('*').eq('profile_id', user.id).limit(1)
  if (byProfile?.[0]) return byProfile[0] as Vendor
  if (user.email) {
    const { data: byEmail } = await supabase.from('dispatch_techs')
      .select('*').ilike('email', user.email).is('profile_id', null).limit(1)
    if (byEmail?.[0]) {
      await supabase.from('dispatch_techs').update({ profile_id: user.id }).eq('id', byEmail[0].id)
      return { ...(byEmail[0] as Vendor), profile_id: user.id }
    }
  }
  return null
}
