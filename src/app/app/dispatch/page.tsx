import { redirect } from 'next/navigation'
import { Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UpgradeGate } from '@/components/billing/UpgradeGate'
import { DispatchClient } from '@/components/dispatch/DispatchClient'
import { getDispatchContext, getDispatchData } from './data'

export const dynamic = 'force-dynamic'

export default async function DispatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ctx = await getDispatchContext()
  if (!ctx.companyId) redirect('/app/dashboard')
  if (!ctx.allowed) {
    return (
      <UpgradeGate icon={Radio} title="Dispatch is a paid feature">
        The service-call command center — prioritized dispatch queue, kanban lanes,
        store and tech management, notes and full activity history — is available
        on the Individual, Pro, and Business plans.
      </UpgradeGate>
    )
  }

  const data = await getDispatchData()

  return (
    <DispatchClient
      stores={data.stores}
      vendors={data.vendors}
      customers={data.customers}
      assets={data.assets}
      priorityLevels={data.priorityLevels}
      formFields={data.formFields}
      hiddenBuiltinFields={data.hiddenBuiltinFields}
      calls={data.calls}
      canEdit={ctx.canEdit}
    />
  )
}
