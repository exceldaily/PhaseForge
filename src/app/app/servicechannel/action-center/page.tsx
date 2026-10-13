import { requireSc, loadWorkOrders, contactedSinceUnsat, loadPeople, loadTemplates, loadDepartments, loadSettings } from '@/lib/servicechannel/server'
import { loadProjects, loadRecoveries, loadTasks } from '@/lib/servicechannel/records'
import { buildActionCenter } from '@/lib/servicechannel/actionCenter'
import { ActionCenterClient } from './ActionCenterClient'

export const dynamic = 'force-dynamic'

export default async function ScActionQueuePage({ searchParams }: { searchParams: Promise<{ open?: string; dept?: string; owner?: string }> }) {
  const { admin, companyId } = await requireSc()
  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const [wos, tasks, recoveries, projects, people, templates, departments, settings] = await Promise.all([
    loadWorkOrders(admin, companyId), loadTasks(admin, companyId), loadRecoveries(admin, companyId), loadProjects(admin, companyId, today),
    loadPeople(admin, companyId), loadTemplates(admin, companyId), loadDepartments(admin, companyId), loadSettings(admin, companyId),
  ])
  const contacted = await contactedSinceUnsat(admin, companyId, wos)
  const ac = buildActionCenter({ wos, tasks, recoveries, projects, contactedSinceUnsat: contacted, today, thresholds: settings.thresholds })
  const woIds = new Set([...ac.needsToday, ...ac.upcoming, ...ac.waiting].flatMap((s) => s.items.map((i) => i.woId).filter((x): x is string => !!x)))
  const taskIds = new Set([...ac.needsToday, ...ac.upcoming, ...ac.waiting].flatMap((s) => s.items.map((i) => i.taskId).filter((x): x is string => !!x)))
  return (
    <ActionCenterClient
      wos={wos.filter((w) => woIds.has(w.id))} tasks={tasks.filter((t) => taskIds.has(t.id))}
      sections={{ needsToday: ac.needsToday, upcoming: ac.upcoming, waiting: ac.waiting }} counts={ac.counts}
      people={people} templates={templates} departments={departments} today={today} initialOpen={sp.open ?? null} initialDept={sp.dept ?? null} initialOwner={sp.owner ?? null} thresholds={settings.thresholds}
    />
  )
}
