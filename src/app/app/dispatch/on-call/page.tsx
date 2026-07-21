import { redirect } from 'next/navigation'
import { Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UpgradeGate } from '@/components/billing/UpgradeGate'
import { OnCallClient } from '@/components/dispatch/OnCallClient'
import { getDispatchContext, getOnCallData } from '../data'

export const dynamic = 'force-dynamic'

export default async function OnCallPage() {
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

  const { participants, settings } = await getOnCallData()

  return <OnCallClient participants={participants} settings={settings} canEdit={ctx.canEdit} />
}
