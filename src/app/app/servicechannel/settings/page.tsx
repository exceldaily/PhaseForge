import { requireSc, loadMetrics, loadSettings, BASELINE_SOURCE } from '@/lib/servicechannel/server'
import { SettingsClient } from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function ScSettingsPage() {
  const { admin, companyId } = await requireSc()
  const [metrics, settings] = await Promise.all([loadMetrics(admin, companyId), loadSettings(admin, companyId)])
  return <SettingsClient metrics={metrics} settings={settings} baselineLoaded={metrics.some((m) => m.source === BASELINE_SOURCE)} />
}
