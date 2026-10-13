import { requireSc, loadPeople, loadDepartments } from '@/lib/servicechannel/server'
import { loadInvestigations, loadProjects } from '@/lib/servicechannel/records'
import { RcaClient } from './RcaClient'

export const dynamic = 'force-dynamic'

export default async function ScRcaPage({ searchParams }: { searchParams: Promise<{ new?: string; tn?: string; customer?: string; equipment?: string }> }) {
  const { admin, companyId } = await requireSc()
  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const [investigations, projects, people, departments] = await Promise.all([loadInvestigations(admin, companyId), loadProjects(admin, companyId, today), loadPeople(admin, companyId), loadDepartments(admin, companyId)])
  return <RcaClient investigations={investigations} projects={projects.filter((p) => p.status !== 'cancelled').map((p) => ({ id: p.id, name: p.name }))} people={people} departments={departments} today={today}
    prefill={sp.new === '1' || sp.tn ? { trackingNumber: sp.tn ?? '', customerName: sp.customer ?? '', equipment: sp.equipment ?? '' } : null} />
}
