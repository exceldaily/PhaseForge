import { requireSc, loadWorkOrders, loadPeople, loadTemplates, loadDepartments, loadSavedViews } from '@/lib/servicechannel/server'
import { WorkOrdersClient } from './WorkOrdersClient'

export const dynamic = 'force-dynamic'

export default async function ScWorkOrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; dept?: string }> }) {
  const { admin, companyId, userId } = await requireSc()
  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const [wos, people, templates, departments, savedViews, overdue] = await Promise.all([
    loadWorkOrders(admin, companyId), loadPeople(admin, companyId), loadTemplates(admin, companyId), loadDepartments(admin, companyId), loadSavedViews(admin, companyId, userId, 'servicechannel.work-orders'),
    admin.from('sc_tasks').select('work_order_id').eq('company_id', companyId).neq('status', 'verified_resolved').lt('due_date', today).limit(5000),
  ])
  return (
    <WorkOrdersClient wos={wos} people={people} templates={templates} departments={departments} savedViews={savedViews} today={today}
      overdueTaskIds={[...new Set((overdue.data ?? []).map((t) => t.work_order_id as string))]} initial={{ view: sp.view ?? 'active', q: sp.q ?? '', dept: sp.dept ?? '' }} />
  )
}
