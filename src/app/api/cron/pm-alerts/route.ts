import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { daysBetween, shiftDays } from '@/lib/pm/quarters'
import { PM_MODULE_KEY, notifyPm, techProfileId } from '@/lib/pm/server'

export const maxDuration = 120

// Daily sweep for the Preventative Maintenance alerts that nothing else
// triggers, because they come from time passing rather than from someone
// pressing a button: a PM going past its due date, materials sitting
// unordered or past their ETA, and received materials nobody has installed.
// Each alert repeats at most once a week per PM (pm_alert_log), and only for
// companies with the module on and the matching alert switched on.
// Scheduled in vercel.json. Can also be called with ?secret=CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qs = new URL(req.url).searchParams.get('secret')
    if (auth !== `Bearer ${secret}` && qs !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let admin
  try { admin = createAdminClient() } catch { return NextResponse.json({ error: 'service credentials missing' }, { status: 500 }) }

  const today = new Date().toISOString().slice(0, 10)
  // Monday of this week: the key that makes an alert repeat weekly, not daily.
  const week = shiftDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7))
  const { data: mods } = await admin.from('organization_modules').select('company_id').eq('module_key', PM_MODULE_KEY).eq('enabled', true)
  const summary: Record<string, { overdue: number; materialsLate: number; toInstall: number }> = {}

  for (const m of mods ?? []) {
    const companyId = m.company_id as string
    const out = { overdue: 0, materialsLate: 0, toInstall: 0 }
    const [{ data: cycles }, { data: materials }] = await Promise.all([
      admin.from('pm_cycles').select('id, year, quarter, due_date, tech_id, status, pm_stores(store_number)').eq('company_id', companyId)
        .not('status', 'in', '(completed,cancelled)').limit(5000),
      admin.from('pm_materials').select('id, pm_id, name, status, requested_date, eta_date, received_date').eq('company_id', companyId)
        .not('status', 'in', '(installed,cancelled)').limit(5000),
    ])
    const label = new Map((cycles ?? []).map((c) => [c.id as string, `${(c.pm_stores as unknown as { store_number?: string } | null)?.store_number ?? 'Store'} Q${c.quarter} ${c.year}`]))
    const techOf = new Map((cycles ?? []).map((c) => [c.id as string, c.tech_id as string | null]))

    for (const c of cycles ?? []) {
      const due = c.due_date as string | null
      if (!due || due >= today) continue
      const days = daysBetween(due, today)
      await notifyPm({
        companyId, rule: 'overdue', dedupe: `overdue:${c.id}:${week}`, link: `/app/pm/jobs/${c.id}`,
        title: `PM overdue: ${label.get(c.id as string)}`, body: `Due ${due}, ${days} ${days === 1 ? 'day' : 'days'} ago.`,
        profileIds: [await techProfileId(admin, c.tech_id as string | null)],
      })
      out.overdue++
    }

    // One alert per PM, however many of its requests are late.
    const late = new Map<string, string[]>()
    const waiting = new Map<string, string[]>()
    for (const mat of materials ?? []) {
      const pmId = mat.pm_id as string
      if (!label.has(pmId)) continue
      const status = mat.status as string
      const eta = mat.eta_date as string | null
      const push = (map: Map<string, string[]>) => map.set(pmId, [...(map.get(pmId) ?? []), mat.name as string])
      if (status === 'backordered' || (eta && eta < today && !['received', 'partially_received'].includes(status))
        || (['needed', 'approved'].includes(status) && daysBetween(mat.requested_date as string, today) > 3)) push(late)
      else if (status === 'received' && mat.received_date && daysBetween(mat.received_date as string, today) >= 7) push(waiting)
    }
    for (const [pmId, names] of late) {
      await notifyPm({
        companyId, rule: 'materialsDelayed', dedupe: `matlate:${pmId}:${week}`, link: `/app/pm/jobs/${pmId}#materials`,
        title: `Materials late or not ordered: ${label.get(pmId)}`, body: names.slice(0, 4).join(', ') + (names.length > 4 ? `, and ${names.length - 4} more` : ''),
      })
      out.materialsLate++
    }
    for (const [pmId, names] of waiting) {
      await notifyPm({
        companyId, rule: 'materialsReceived', dedupe: `matinstall:${pmId}:${week}`, link: `/app/pm/jobs/${pmId}#materials`,
        title: `Received and waiting to be installed: ${label.get(pmId)}`, body: names.slice(0, 4).join(', ') + (names.length > 4 ? `, and ${names.length - 4} more` : ''),
        profileIds: [await techProfileId(admin, techOf.get(pmId))],
      })
      out.toInstall++
    }
    summary[companyId] = out
  }
  // Old dedupe keys are no use after a couple of months.
  await admin.from('pm_alert_log').delete().lt('created_at', new Date(`${shiftDays(today, -70)}T00:00:00Z`).toISOString())
  return NextResponse.json({ ok: true, today, companies: Object.keys(summary).length, summary })
}
