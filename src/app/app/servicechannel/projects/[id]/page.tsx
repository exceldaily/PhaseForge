import { notFound } from 'next/navigation'
import { requireSc, loadPeople, loadDepartments } from '@/lib/servicechannel/server'
import { loadProject } from '@/lib/servicechannel/records'
import { ProjectClient } from './ProjectClient'

export const dynamic = 'force-dynamic'

export default async function ScProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin, companyId } = await requireSc()
  const { id } = await params
  const today = new Date().toISOString().slice(0, 10)
  const bundle = await loadProject(admin, companyId, id, today)
  if (!bundle) notFound()
  const [people, departments] = await Promise.all([loadPeople(admin, companyId), loadDepartments(admin, companyId)])
  return <ProjectClient bundle={bundle} people={people} departments={departments} today={today} />
}
