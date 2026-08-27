import { notFound } from 'next/navigation'
import { loadPlansData } from '@/lib/plans/queries.server'
import { PlansHome } from './PlansHome'
import { canEditCompanyData } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function ProjectPlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const data = await loadPlansData(projectId)
  if (!data) notFound()

  return (
    <PlansHome
      projectId={projectId}
      projectName={data.projectName}
      companyId={data.companyId}
      userId={data.userId}
      canManage={data.canManage}
      isAdmin={canEditCompanyData(data)}
      sheets={data.sheets}
      sets={data.sets}
      lastVisitAt={data.lastVisitAt}
    />
  )
}
