import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OPERATIONS_MODULES, moduleAllowsRole, getModuleDef } from './modules'
import type { ModuleKey, OpsRole, OrgCallSettings } from './types'

export interface OpsContext {
  userId: string
  companyId: string
  opsRole: OpsRole
  enabledModules: ModuleKey[]
}

// Fetch the operations context for the signed-in user. Redirects to /login when
// signed out. Never trusts the client: entitlements come straight from the DB
// (and RLS re-enforces everything at the data layer regardless).
export async function getOpsContext(): Promise<OpsContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, ops_role')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) redirect('/app/dashboard')

  const { data: modules } = await supabase
    .from('organization_modules')
    .select('module_key, enabled')
    .eq('company_id', profile.company_id)

  return {
    userId: user.id,
    companyId: profile.company_id,
    opsRole: (profile.ops_role ?? 'read_only') as OpsRole,
    enabledModules: (modules ?? [])
      .filter((m) => m.enabled)
      .map((m) => m.module_key as ModuleKey),
  }
}

// Route guard: every operations page calls this before rendering. A disabled
// module or disallowed role redirects to the dashboard — direct URLs included.
export async function requireModule(key: ModuleKey): Promise<OpsContext> {
  const ctx = await getOpsContext()
  if (!ctx.enabledModules.includes(key)) redirect('/app/dashboard')
  const def = getModuleDef(key)
  if (def && !moduleAllowsRole(def, ctx.opsRole)) redirect('/app/dashboard')
  return ctx
}

// Sidebar helper: which operations modules should this user see links for?
export function visibleModules(ctx: OpsContext) {
  return OPERATIONS_MODULES.filter(
    (m) => ctx.enabledModules.includes(m.key) && moduleAllowsRole(m, ctx.opsRole)
  )
}

const DEFAULT_STATUSES = [
  { key: 'open', label: 'Open', closed: false },
  { key: 'assigned', label: 'Assigned', closed: false },
  { key: 'in_progress', label: 'In Progress', closed: false },
  { key: 'waiting_vendor', label: 'Waiting on Vendor', closed: false },
  { key: 'waiting_parts', label: 'Waiting on Parts', closed: false },
  { key: 'waiting_customer', label: 'Waiting on Customer', closed: false },
  { key: 'waiting_quote', label: 'Waiting on Quote', closed: false },
  { key: 'follow_up', label: 'Follow-Up Required', closed: false },
  { key: 'completed', label: 'Completed', closed: true },
  { key: 'closed', label: 'Closed', closed: true },
  { key: 'cancelled', label: 'Cancelled', closed: true },
]

const DEFAULT_PRIORITIES = [
  { key: 'low', label: 'Low', color: '#94a3b8' },
  { key: 'normal', label: 'Normal', color: '#38bdf8' },
  { key: 'high', label: 'High', color: '#fb923c' },
  { key: 'emergency', label: 'Emergency', color: '#ef4444' },
]

// Call settings with defaults when the org hasn't customized anything yet.
export async function getCallSettings(companyId: string): Promise<OrgCallSettings> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('org_call_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()

  return {
    company_id: companyId,
    terminology: data?.terminology ?? 'Calls',
    template_kind: data?.template_kind ?? 'commercial',
    statuses: data?.statuses ?? DEFAULT_STATUSES,
    priorities: data?.priorities ?? DEFAULT_PRIORITIES,
    card_fields: data?.card_fields ?? ['customer', 'location', 'priority', 'status', 'assigned', 'due', 'sla', 'invoice_ready', 'unread'],
    required_fields: data?.required_fields ?? [],
    required_closeout_fields: data?.required_closeout_fields ?? [],
    require_completion_photo: data?.require_completion_photo ?? false,
    default_view: data?.default_view ?? 'list',
    use_divisions: data?.use_divisions ?? true,
    quick_actions: data?.quick_actions ?? ['assign', 'status', 'note'],
  }
}

// Append to the shared operations activity timeline (best-effort; never throws).
export async function logOpsActivity(input: {
  companyId: string
  actorId: string
  actorName?: string
  recordType: string
  recordId: string
  action: string
  detail?: Record<string, unknown>
}) {
  const supabase = await createClient()
  await supabase.from('ops_activity').insert({
    company_id: input.companyId,
    actor_id: input.actorId,
    actor_name: input.actorName ?? null,
    record_type: input.recordType,
    record_id: input.recordId,
    action: input.action,
    detail: input.detail ?? {},
  })
}
