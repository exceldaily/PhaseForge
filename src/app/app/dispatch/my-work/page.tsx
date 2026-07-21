import { redirect } from 'next/navigation'
import { Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UpgradeGate } from '@/components/billing/UpgradeGate'
import { MyWorkClient } from '@/components/dispatch/MyWorkClient'
import { getDispatchContext, getDispatchData, getMyTech } from '../data'

export const dynamic = 'force-dynamic'

export default async function MyWorkPage() {
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

  const [data, myTech] = await Promise.all([getDispatchData(), getMyTech()])
  const myCalls = myTech
    ? data.calls.filter((c) => c.assigned_vendor_id === myTech.id || c.vendors.some((v) => v.id === myTech.id))
    : []

  return (
    <MyWorkClient
      myTech={myTech}
      techs={data.vendors}
      calls={myCalls}
      vendors={data.vendors}
      assets={data.assets}
      priorityLevels={data.priorityLevels}
      formFields={data.formFields}
      hiddenBuiltinFields={data.hiddenBuiltinFields}
      // Techs work their own calls from the field; server actions still guard
      // manager-only edits (manager note, call number, deletes).
      canEdit={true}
    />
  )
}
