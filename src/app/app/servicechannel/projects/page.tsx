import { requireSc, loadPeople, loadDepartments } from '@/lib/servicechannel/server'
import { loadProjects } from '@/lib/servicechannel/records'
import { ProjectsClient } from './ProjectsClient'

export const dynamic = 'force-dynamic'

export default async function ScProjectsPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const [projects, people, departments] = await Promise.all([loadProjects(admin, companyId, today), loadPeople(admin, companyId), loadDepartments(admin, companyId)])
  return <ProjectsClient projects={projects} people={people} departments={departments} today={today} />
}
