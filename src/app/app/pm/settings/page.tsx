import { loadSettings, loadTechs, mapRows, requirePm } from '@/lib/pm/server'
import type { TemplateVersion } from '@/lib/pm/types'
import { SettingsClient, type TemplateRow } from './SettingsClient'

export const metadata = { title: 'PM Settings | PhaseForge' }

export const maxDuration = 60

export default async function PmSettingsPage() {
  const ctx = await requirePm()
  const [settings, techs, { data: people }, { data: versions }, { data: items }, { data: used }] = await Promise.all([
    loadSettings(ctx.supabase, ctx.companyId),
    loadTechs(ctx.supabase, ctx.companyId),
    ctx.supabase.from('profiles').select('id, full_name, email').eq('company_id', ctx.companyId).eq('is_active', true).order('full_name'),
    ctx.supabase.from('pm_template_versions').select('id, name, quarter, version, revision_label, status, notes, published_at, created_at').eq('company_id', ctx.companyId).order('quarter').order('version', { ascending: false }),
    ctx.supabase.from('pm_template_items').select('version_id').eq('company_id', ctx.companyId).limit(20000),
    ctx.supabase.from('pm_cycles').select('template_version_id').eq('company_id', ctx.companyId).not('template_version_id', 'is', null).limit(20000),
  ])
  const tally = (rows: Record<string, unknown>[] | null, key: string) => {
    const out: Record<string, number> = {}
    for (const r of rows ?? []) out[r[key] as string] = (out[r[key] as string] ?? 0) + 1
    return out
  }
  const itemCount = tally(items, 'version_id')
  const pmCount = tally(used, 'template_version_id')
  const templates: TemplateRow[] = mapRows<Omit<TemplateVersion, 'dataTables'>>(versions).map((v) => ({ ...v, items: itemCount[v.id] ?? 0, pms: pmCount[v.id] ?? 0 }))

  return (
    <SettingsClient
      rules={settings.rules}
      notify={settings.notify}
      techs={techs}
      people={(people ?? []).map((p) => ({ id: p.id as string, name: ((p.full_name as string | null) ?? '').trim() || (p.email as string | null) || 'Someone', email: (p.email as string | null) ?? null }))}
      templates={templates}
      isAdmin={ctx.isAdmin}
      canCoordinate={ctx.isCoordinator}
    />
  )
}
