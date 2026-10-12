import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminOrg } from '@/lib/permissions'
import { PA_MODULE_KEY } from '@/lib/payroll-audit/server'

export const dynamic = 'force-dynamic'

// CSV of findings for the signed-in administrator's company. Same gate as the
// dashboard; home addresses are never in a finding, so none are in the file.

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('company_id, role, ops_role').eq('id', user.id).single()
  if (!profile?.company_id || !canAdminOrg(profile)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { data: mod } = await supabase.from('organization_modules').select('enabled').eq('company_id', profile.company_id).eq('module_key', PA_MODULE_KEY).maybeSingle()
  if (!mod?.enabled) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const admin = createAdminClient()
  let q = admin.from('payroll_audit_findings').select('*').eq('company_id', profile.company_id).is('superseded_at', null)
    .order('work_date', { ascending: false, nullsFirst: false }).limit(5000)
  if (sp.get('from')) q = q.gte('work_date', sp.get('from')!)
  if (sp.get('to')) q = q.lte('work_date', sp.get('to')!)
  const { data } = await q

  const cols = ['work_date', 'employee_name', 'category', 'travel_type', 'origin_label', 'dest_label', 'job_numbers', 'recorded_minutes',
    'estimated_minutes', 'allowed_minutes', 'excess_minutes', 'review_status', 'review_note', 'route_provider', 'summary']
  const csv = [cols.join(','), ...(data ?? []).map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(','))].join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
