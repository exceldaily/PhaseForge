import { requireSc, loadMetrics, loadSettings, BASELINE_SOURCE } from '@/lib/servicechannel/server'
import { loadProjects } from '@/lib/servicechannel/records'
import { ScoresClient } from './ScoresClient'

export const dynamic = 'force-dynamic'

export default async function ScScoresPage() {
  const { admin, companyId } = await requireSc()
  const today = new Date().toISOString().slice(0, 10)
  const [metrics, settings, projects] = await Promise.all([loadMetrics(admin, companyId), loadSettings(admin, companyId), loadProjects(admin, companyId, today)])
  return <ScoresClient metrics={metrics} settings={settings} projects={projects.filter((p) => p.status !== 'cancelled').map((p) => ({ id: p.id, name: p.name, scoreCategory: p.scoreCategory, status: p.status, scopeCustomer: p.scopeCustomer }))} today={today} baselineLoaded={metrics.some((m) => m.source === BASELINE_SOURCE)} />
}
