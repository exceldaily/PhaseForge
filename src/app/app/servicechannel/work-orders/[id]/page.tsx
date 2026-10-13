import { notFound } from 'next/navigation'
import { requireSc, loadCase, loadPeople, loadDepartments } from '@/lib/servicechannel/server'
import { parseNotes } from '@/lib/servicechannel/notes'
import { CaseClient } from './CaseClient'

export const dynamic = 'force-dynamic'

export default async function ScCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { admin, companyId } = await requireSc()
  const { id } = await params
  const [bundle, people, departments, company] = await Promise.all([
    loadCase(admin, companyId, id), loadPeople(admin, companyId), loadDepartments(admin, companyId),
    admin.from('companies').select('schedule_job_url_template').eq('id', companyId).single(),
  ])
  if (!bundle) notFound()
  const notes = parseNotes(bundle.wo.notesRaw)
  const { notesRaw: _n, ...wo } = bundle.wo
  void _n
  return <CaseClient wo={wo} tasks={bundle.tasks} events={bundle.events} observations={bundle.observations} notes={notes} people={people} departments={departments}
    jobUrlTemplate={(company.data?.schedule_job_url_template as string | null) ?? null} today={new Date().toISOString().slice(0, 10)} />
}
