import { requireSc, loadImports, loadMappings } from '@/lib/servicechannel/server'
import { ImportClient } from './ImportClient'

export const dynamic = 'force-dynamic'

export default async function ScImportPage() {
  const { admin, companyId } = await requireSc()
  const [imports, mappings] = await Promise.all([loadImports(admin, companyId), loadMappings(admin, companyId)])
  const { data: known } = await admin.from('sc_work_orders').select('customer_name').eq('company_id', companyId).not('customer_name', 'is', null).limit(2000)
  const subscribers = [...new Set((known ?? []).map((r) => r.customer_name as string))].sort()
  return <ImportClient imports={imports} mappings={mappings} knownSubscribers={subscribers} />
}
