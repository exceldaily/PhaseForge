import { notFound } from 'next/navigation'
import { requireSc, loadCase, loadPeople, loadDepartments, loadTemplates, loadLinks, loadSameStore, loadAttachments } from '@/lib/servicechannel/server'
import { parseNotes } from '@/lib/servicechannel/notes'
import { suggestFor } from '@/lib/servicechannel/rules'
import { CaseClient } from './CaseClient'

export const dynamic = 'force-dynamic'

export default async function ScCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { admin, companyId } = await requireSc()
  const { id } = await params
  const bundle = await loadCase(admin, companyId, id)
  if (!bundle) notFound()
  const today = new Date().toISOString().slice(0, 10)
  const [people, departments, templates, links, sameStore, attachments, company] = await Promise.all([
    loadPeople(admin, companyId), loadDepartments(admin, companyId), loadTemplates(admin, companyId), loadLinks(admin, companyId, id),
    loadSameStore(admin, companyId, bundle.wo), loadAttachments(admin, companyId, id),
    admin.from('companies').select('schedule_job_url_template').eq('id', companyId).single(),
  ])
  const { notesRaw, ...wo } = bundle.wo
  const notes = parseNotes(notesRaw)
  const since = wo.lastUnsatAt ?? wo.firstSeenAt
  const contacted = bundle.events.some((e) => e.kind === 'customer_contact' && e.createdAt >= since)
  const suggestions = suggestFor(bundle.wo, bundle.tasks.map((t) => ({ id: t.id, status: t.status, dueDate: t.dueDate, title: t.title })), today, { contactedSinceUnsat: contacted })
  const linkedIds = new Set(links.map((l) => l.other.id))
  return (
    <CaseClient wo={wo} tasks={bundle.tasks} events={bundle.events} observations={bundle.observations} notes={notes} suggestions={suggestions}
      links={links} sameStore={sameStore.filter((s) => !linkedIds.has(s.id))} attachments={attachments}
      people={people} departments={departments} templates={templates} jobUrlTemplate={(company.data?.schedule_job_url_template as string | null) ?? null} today={today} />
  )
}
