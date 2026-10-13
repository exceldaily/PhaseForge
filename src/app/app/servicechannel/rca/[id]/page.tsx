import { notFound } from 'next/navigation'
import { requireSc, loadPeople, loadDepartments } from '@/lib/servicechannel/server'
import { loadInvestigation, loadProjects } from '@/lib/servicechannel/records'
import { InvestigationClient } from './InvestigationClient'

export const dynamic = 'force-dynamic'

export default async function ScInvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin, companyId } = await requireSc()
  const { id } = await params
  const today = new Date().toISOString().slice(0, 10)
  const bundle = await loadInvestigation(admin, companyId, id)
  if (!bundle) notFound()
  const [people, departments, projects] = await Promise.all([loadPeople(admin, companyId), loadDepartments(admin, companyId), loadProjects(admin, companyId, today)])
  return <InvestigationClient bundle={bundle} people={people} departments={departments} projects={projects.map((p) => ({ id: p.id, name: p.name }))} today={today} />
}
