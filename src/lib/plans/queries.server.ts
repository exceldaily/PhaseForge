import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { PlanRevision, PlanSet, SheetWithRevision } from '@/types/plans'

export interface PlansPageData {
  projectId: string
  projectName: string
  companyId: string
  userId: string
  role: string
  canManage: boolean
  sheets: SheetWithRevision[]
  sets: PlanSet[]
  lastVisitAt: string | null
}

/** Loads everything the Plans module needs for a project, or null if the
 *  user can't see the project. One round-trip per table, joined in memory. */
export async function loadPlansData(projectId: string): Promise<PlansPageData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: project }] = await Promise.all([
    supabase.from('profiles').select('company_id, role').eq('id', user.id).single(),
    supabase.from('projects').select('id, name, company_id').eq('id', projectId).single(),
  ])
  if (!profile?.company_id || !project || project.company_id !== profile.company_id) return null

  const [sheetsRes, setsRes, favsRes, viewsRes, pinsRes, visitRes] = await Promise.all([
    supabase.from('plan_sheets').select('*').eq('project_id', projectId).order('sort_order'),
    supabase.from('plan_sets').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('plan_favorites').select('sheet_id').eq('user_id', user.id),
    supabase.from('plan_views').select('sheet_id, last_viewed_at').eq('user_id', user.id),
    supabase.from('plan_pins').select('sheet_id, status').eq('company_id', profile.company_id),
    supabase.from('plan_module_visits').select('last_visit_at').eq('user_id', user.id).eq('project_id', projectId).maybeSingle(),
  ])

  const sheets = sheetsRes.data ?? []
  const sheetIds = sheets.map((s) => s.id)
  let revisions: PlanRevision[] = []
  if (sheetIds.length) {
    const { data } = await supabase.from('plan_revisions')
      .select('*').in('sheet_id', sheetIds).order('created_at', { ascending: false })
    revisions = (data ?? []) as PlanRevision[]
  }

  const favSet = new Set((favsRes.data ?? []).map((f) => f.sheet_id))
  const viewMap = new Map((viewsRes.data ?? []).map((v) => [v.sheet_id, v.last_viewed_at as string]))
  const pinCounts = new Map<string, number>()
  for (const p of pinsRes.data ?? []) {
    if (p.status === 'open') pinCounts.set(p.sheet_id, (pinCounts.get(p.sheet_id) ?? 0) + 1)
  }
  const revsBySheet = new Map<string, PlanRevision[]>()
  for (const r of revisions) {
    const list = revsBySheet.get(r.sheet_id) ?? []
    list.push(r)
    revsBySheet.set(r.sheet_id, list)
  }

  const joined: SheetWithRevision[] = sheets.map((s) => {
    const revs = revsBySheet.get(s.id) ?? []
    const current = revs.find((r) => r.id === s.current_revision_id) ?? revs.find((r) => r.status === 'current') ?? revs[0] ?? null
    return {
      ...(s as SheetWithRevision),
      tags: s.tags ?? [],
      current,
      revision_count: revs.length,
      is_favorite: favSet.has(s.id),
      last_viewed_at: viewMap.get(s.id) ?? null,
      open_pin_count: pinCounts.get(s.id) ?? 0,
    }
  })

  return {
    projectId,
    projectName: project.name,
    companyId: profile.company_id,
    userId: user.id,
    role: profile.role,
    canManage: ['owner', 'admin', 'manager'].includes(profile.role),
    sheets: joined,
    sets: (setsRes.data ?? []) as PlanSet[],
    lastVisitAt: visitRes.data?.last_visit_at ?? null,
  }
}
