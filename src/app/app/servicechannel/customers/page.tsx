import { requireSc, loadWorkOrders, loadStoreDirectory } from '@/lib/servicechannel/server'
import { CustomersClient } from './CustomersClient'

export const dynamic = 'force-dynamic'

export default async function ScCustomersPage() {
  const { admin, companyId } = await requireSc()
  const [wos, directory] = await Promise.all([loadWorkOrders(admin, companyId), loadStoreDirectory(admin, companyId)])
  const { data: crm } = await admin.from('customers').select('name').eq('company_id', companyId).order('name').limit(500)
  const known = [...new Set([...(crm ?? []).map((c) => c.name as string), ...directory.map((d) => d.customerName), ...wos.map((w) => w.customerName).filter((x): x is string => !!x)])].sort()

  const stores = new Map<string, { storeNumber: string; label: string | null; city: string | null; state: string | null; region: string | null; total: number; unknown: number; customers: Set<string>; sample: string | null }>()
  for (const w of wos) {
    const k = w.storeNumber ?? '(no store number)'
    const s = stores.get(k) ?? { storeNumber: k, label: w.storeLabel, city: w.storeCity, state: w.storeState, region: w.region, total: 0, unknown: 0, customers: new Set<string>(), sample: w.problemDescription }
    s.total++
    if (w.customerName) s.customers.add(w.customerName); else s.unknown++
    stores.set(k, s)
  }
  const conflicts = wos.filter((w) => w.conflicts.some((c) => !c.resolved)).map((w) => ({ id: w.id, trackingNumber: w.trackingNumber, storeLabel: w.storeLabel, customerName: w.customerName, conflicts: w.conflicts }))
  return (
    <CustomersClient
      stores={[...stores.values()].map((s) => ({ ...s, customers: [...s.customers] })).sort((a, b) => b.unknown - a.unknown || a.storeNumber.localeCompare(b.storeNumber, undefined, { numeric: true }))}
      directory={directory} knownCustomers={known} conflicts={conflicts}
    />
  )
}
