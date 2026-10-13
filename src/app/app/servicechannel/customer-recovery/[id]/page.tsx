import { notFound } from 'next/navigation'
import { requireSc, loadPeople, loadDepartments } from '@/lib/servicechannel/server'
import { loadRecovery } from '@/lib/servicechannel/records'
import { RecoveryClient } from './RecoveryClient'

export const dynamic = 'force-dynamic'

export default async function ScRecoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin, companyId } = await requireSc()
  const { id } = await params
  const bundle = await loadRecovery(admin, companyId, id)
  if (!bundle) notFound()
  const [people, departments] = await Promise.all([loadPeople(admin, companyId), loadDepartments(admin, companyId)])
  return <RecoveryClient recovery={bundle.recovery} tasks={bundle.tasks} events={bundle.events} people={people} departments={departments} today={new Date().toISOString().slice(0, 10)} />
}
