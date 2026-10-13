import { requireSc, loadMetrics, loadSettings, loadTemplates, loadDepartments } from '@/lib/servicechannel/server'
import { SettingsClient } from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function ScSettingsPage() {
  const { admin, companyId } = await requireSc()
  const [metrics, settings, templates, departments] = await Promise.all([loadMetrics(admin, companyId), loadSettings(admin, companyId), loadTemplates(admin, companyId, true), loadDepartments(admin, companyId)])
  return <SettingsClient settings={settings} templates={templates} departments={departments} metricsCount={metrics.length} />
}
