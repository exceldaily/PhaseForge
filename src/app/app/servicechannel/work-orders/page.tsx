import { requireSc, loadWorkOrders, loadPeople } from '@/lib/servicechannel/server'
import { WorkOrdersClient } from './WorkOrdersClient'

export const dynamic = 'force-dynamic'

export default async function ScWorkOrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const { admin, companyId } = await requireSc()
  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const [wos, people, overdue] = await Promise.all([
    loadWorkOrders(admin, companyId), loadPeople(admin, companyId),
    admin.from('sc_tasks').select('work_order_id').eq('company_id', companyId).neq('status', 'verified_resolved').lt('due_date', today).limit(5000),
  ])
  return <WorkOrdersClient wos={wos} people={people} today={today} overdueTaskIds={[...new Set((overdue.data ?? []).map((t) => t.work_order_id as string))]} initialView={sp.view ?? 'active'} initialQuery={sp.q ?? ''} />
}
