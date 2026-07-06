import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { pushPhase } from '@/lib/scheduling/syncCore'

export const maxDuration = 300

// Background true-up: for every org with an active Google connection,
// re-push all linked phases (catches edits made outside the UI hooks) and
// push any not-yet-linked phases in auto-sync projects. Idempotent.
// Scheduled via vercel.json; can also be triggered by cron-job.org with
// ?secret=CRON_SECRET for more frequent runs.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qs = new URL(req.url).searchParams.get('secret')
    if (auth !== `Bearer ${secret}` && qs !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'service credentials missing' }, { status: 500 })
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data: connections } = await supabase
    .from('gcal_connections')
    .select('company_id')
    .eq('is_active', true)
    .not('target_calendar_id', 'is', null)

  const summary: Record<string, { pushed: number; failed: number }> = {}

  for (const conn of connections ?? []) {
    const companyId = conn.company_id as string
    let pushed = 0, failed = 0

    // 1) Re-push only linked phases that CHANGED since their last push —
    //    keeps runs fast and within serverless time limits even with
    //    hundreds of linked events (54 unchanged links = 0 Google calls).
    const { data: links } = await supabase
      .from('gcal_event_links')
      .select('phase_id, last_pushed_at')
      .eq('company_id', companyId).eq('status', 'linked').eq('sync_enabled', true)
      .limit(500)
    const linkedIds = new Set<string>()
    const lastPushed = new Map<string, string | null>()
    for (const l of links ?? []) {
      if (!l.phase_id) continue
      linkedIds.add(l.phase_id)
      lastPushed.set(l.phase_id, l.last_pushed_at)
    }
    let stale: string[] = []
    if (linkedIds.size) {
      const { data: phs } = await supabase
        .from('phases').select('id, updated_at').in('id', [...linkedIds])
      stale = (phs ?? [])
        .filter((p) => {
          const pushedAt = lastPushed.get(p.id)
          return !pushedAt || (p.updated_at && new Date(p.updated_at) > new Date(pushedAt))
        })
        .map((p) => p.id)
    }
    const MAX_PUSHES_PER_ORG = 50
    for (const id of stale.slice(0, MAX_PUSHES_PER_ORG)) {
      try { await pushPhase(supabase, companyId, id); pushed++ }
      catch { failed++ }
    }

    // 2) Push new (unlinked) phases in auto-sync projects.
    const { data: autoProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('company_id', companyId).eq('gcal_autosync', true).eq('is_archived', false)
    for (const proj of autoProjects ?? []) {
      const { data: phases } = await supabase
        .from('phases').select('id').eq('project_id', proj.id).limit(100)
      for (const p of phases ?? []) {
        if (linkedIds.has(p.id)) continue
        if (pushed >= 60) break // stay well inside serverless time limits
        try { await pushPhase(supabase, companyId, p.id); pushed++ }
        catch { failed++ }
      }
    }
    summary[companyId] = { pushed, failed }
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), summary })
}
