import { requireSc, loadMetrics, loadSettings, loadTemplates, loadDepartments, BASELINE_SOURCE } from '@/lib/servicechannel/server'
import { SettingsClient } from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function ScSettingsPage() {
  const { admin, companyId } = await requireSc()
  const [metrics, settings, templates, departments] = await Promise.all([loadMetrics(admin, companyId), loadSettings(admin, companyId), loadTemplates(admin, companyId, true), loadDepartments(admin, companyId)])
  return <SettingsClient metrics={metrics} settings={settings} templates={templates} departments={departments} baselineLoaded={metrics.some((m) => m.source === BASELINE_SOURCE)} />
}
