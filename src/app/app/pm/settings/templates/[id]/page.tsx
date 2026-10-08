import { notFound } from 'next/navigation'
import { loadTemplateItems, mapTemplate, requirePm } from '@/lib/pm/server'
import { TemplateEditor } from './TemplateEditor'

export const metadata = { title: 'PM Checklist Template | PhaseForge' }

export default async function PmTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePm()
  const { data: v } = await ctx.supabase.from('pm_template_versions').select('*').eq('id', id).eq('company_id', ctx.companyId).maybeSingle()
  if (!v) notFound()
  const [items, { count }] = await Promise.all([
    loadTemplateItems(ctx.supabase, id),
    ctx.supabase.from('pm_cycles').select('id', { count: 'exact', head: true }).eq('template_version_id', id),
  ])
  return <TemplateEditor template={mapTemplate(v)} items={items} pmCount={count ?? 0} isAdmin={ctx.isAdmin} />
}
