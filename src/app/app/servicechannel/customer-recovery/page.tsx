import { requireSc, loadPeople, loadDepartments } from '@/lib/servicechannel/server'
import { loadRecoveries } from '@/lib/servicechannel/records'
import { RecoveryListClient } from './RecoveryListClient'

export const dynamic = 'force-dynamic'

export default async function ScRecoveryListPage({ searchParams }: { searchParams: Promise<{ new?: string; wo?: string }> }) {
  const { admin, companyId } = await requireSc()
  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const [recoveries, people, departments] = await Promise.all([loadRecoveries(admin, companyId), loadPeople(admin, companyId), loadDepartments(admin, companyId)])
  let prefill: { workOrderId: string; trackingNumber: string; customerName: string | null; storeLabel: string | null; problem: string | null } | null = null
  if (sp.wo) {
    const { data: w } = await admin.from('sc_work_orders').select('id, tracking_number, customer_name, store_label, problem_description').eq('company_id', companyId).eq('id', sp.wo).maybeSingle()
    if (w) prefill = { workOrderId: w.id as string, trackingNumber: w.tracking_number as string, customerName: (w.customer_name as string | null) ?? null, storeLabel: (w.store_label as string | null) ?? null, problem: (w.problem_description as string | null) ?? null }
  }
  return <RecoveryListClient recoveries={recoveries} people={people} departments={departments} today={today} openNew={sp.new === '1' || !!prefill} prefill={prefill} />
}
