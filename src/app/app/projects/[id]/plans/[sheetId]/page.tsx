import { notFound } from 'next/navigation'
import { loadPlansData } from '@/lib/plans/queries.server'
import { createClient } from '@/lib/supabase/server'
import { PlanViewerShell } from '@/components/plans/PlanViewerShell'
import type { PlanViewState } from '@/types/plans'

export const dynamic = 'force-dynamic'

export default async function PlanSheetPage({
  params, searchParams,
}: {
  params: Promise<{ id: string; sheetId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id: projectId, sheetId } = await params
  const sp = await searchParams
  const data = await loadPlansData(projectId)
  if (!data) notFound()
  const sheet = data.sheets.find((s) => s.id === sheetId)
  if (!sheet) notFound()

  // Share links can carry a view position; otherwise restore the user's last
  // remembered position for this sheet.
  let initialView: PlanViewState | null = null
  const z = typeof sp.z === 'string' ? parseFloat(sp.z) : NaN
  if (!isNaN(z) && z > 0) {
    initialView = {
      zoom: z,
      cx: clamp01(parseFloat(typeof sp.cx === 'string' ? sp.cx : '0.5')),
      cy: clamp01(parseFloat(typeof sp.cy === 'string' ? sp.cy : '0.5')),
      rotation: ([0, 90, 180, 270].includes(Number(sp.rot)) ? Number(sp.rot) : 0) as PlanViewState['rotation'],
    }
  } else {
    const supabase = await createClient()
    const { data: view } = await supabase.from('plan_views')
      .select('view_state').eq('user_id', data.userId).eq('sheet_id', sheetId).maybeSingle()
    if (view?.view_state) initialView = view.view_state as PlanViewState
  }

  const supabase = await createClient()
  const { data: memberRows } = await supabase.from('profiles')
    .select('id, full_name').eq('company_id', data.companyId).eq('is_active', true)

  const initialRevisionId = typeof sp.rev === 'string' ? sp.rev : null
  const initialCompareRevisionId = typeof sp.compare === 'string' ? sp.compare : null

  return (
    <PlanViewerShell
      projectId={projectId}
      projectName={data.projectName}
      sheets={data.sheets}
      initialSheetId={sheetId}
      initialRevisionId={initialRevisionId}
      initialCompareRevisionId={initialCompareRevisionId}
      initialView={initialView}
      members={memberRows ?? []}
      currentUserId={data.userId}
      canManage={data.canManage}
      canMarkup={true}
    />
  )
}

function clamp01(n: number) {
  return isNaN(n) ? 0.5 : Math.min(1, Math.max(0, n))
}
