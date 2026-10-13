import { requireSc, loadWorkOrders, loadOpenTasksLite, contactedSinceUnsat, loadPeople, loadTemplates, loadDepartments } from '@/lib/servicechannel/server'
import { buildActionCenter } from '@/lib/servicechannel/actionCenter'
import { ActionCenterClient } from './ActionCenterClient'

export const dynamic = 'force-dynamic'

export default async function ScActionCenterPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const [wos, tasksByWo, people, templates, departments] = await Promise.all([
    loadWorkOrders(admin, companyId), loadOpenTasksLite(admin, companyId), loadPeople(admin, companyId), loadTemplates(admin, companyId), loadDepartments(admin, companyId),
  ])
  const contacted = await contactedSinceUnsat(admin, companyId, wos)
  const ac = buildActionCenter({ wos, tasksByWo, contactedSinceUnsat: contacted, today })
  // Only the work orders that appear somewhere, so the client payload stays small.
  const ids = new Set([...ac.needsToday, ...ac.upcoming, ...ac.waiting].flatMap((s) => s.items.map((i) => i.wo.id)))
  const slim = (s: typeof ac.needsToday) => s.map((sec) => ({ key: sec.key, label: sec.label, items: sec.items.map((i) => ({ id: i.wo.id, reason: i.reason, due: i.due, daysWaiting: i.daysWaiting, taskId: i.taskId })) }))
  return (
    <ActionCenterClient
      wos={wos.filter((w) => ids.has(w.id))}
      sections={{ needsToday: slim(ac.needsToday), upcoming: slim(ac.upcoming), waiting: slim(ac.waiting) }}
      counts={ac.counts} people={people} templates={templates} departments={departments} today={today}
    />
  )
}
