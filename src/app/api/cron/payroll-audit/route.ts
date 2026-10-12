import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, todayIn } from '@/lib/payroll-audit/time'
import { PA_MODULE_KEY, ensureSettings, expireStaleRuns, queueRun } from '@/lib/payroll-audit/server'

export const maxDuration = 60

// Daily: queue a scheduled audit of the last few days for each company that
// has switched scheduling on, and expire runs nobody can finish. The browser
// lives on a local computer, so this only queues work. If the worker is not
// online the run waits, and after 24 hours it is marked failed and the
// administrators are told. It never reports success it did not get.
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

  const { data: mods } = await admin.from('organization_modules').select('company_id').eq('module_key', PA_MODULE_KEY).eq('enabled', true)
  const out: Record<string, string> = {}
  for (const m of mods ?? []) {
    const companyId = m.company_id as string
    await expireStaleRuns(admin, companyId)
    const s = await ensureSettings(admin, companyId)
    if (!s.scheduleEnabled) { out[companyId] = 'schedule off'; continue }
    const today = todayIn(s.timezone)
    const { data: already } = await admin.from('payroll_audit_runs').select('id').eq('company_id', companyId).eq('trigger', 'scheduled')
      .gte('queued_at', `${today}T00:00:00Z`).limit(1)
    if (already?.length) { out[companyId] = 'already queued today'; continue }
    const r = await queueRun(admin, { companyId, start: addDays(today, -s.scheduleDaysBack), end: today, trigger: 'scheduled', requestedBy: null })
    out[companyId] = r.ok ? 'queued' : r.error
  }
  return NextResponse.json({ ok: true, companies: out })
}
