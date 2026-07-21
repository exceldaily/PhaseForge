import { redirect } from 'next/navigation'
import { Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UpgradeGate } from '@/components/billing/UpgradeGate'
import { PrioritiesClient } from '@/components/dispatch/PrioritiesClient'
import { getDispatchContext, getDispatchData } from '../data'

export const dynamic = 'force-dynamic'

export default async function PrioritiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ctx = await getDispatchContext()
  if (!ctx.companyId) redirect('/app/dashboard')
  if (!ctx.allowed) {
    return (
      <UpgradeGate icon={Radio} title="Dispatch is a paid feature">
        The service-call command center is available on the Individual, Pro, and Business plans.
      </UpgradeGate>
    )
  }

  const data = await getDispatchData()

  return (
    <PrioritiesClient
      customers={data.customers}
      stores={data.stores}
      priorityLevels={data.priorityLevels}
      canEdit={ctx.canEdit}
    />
  )
}
