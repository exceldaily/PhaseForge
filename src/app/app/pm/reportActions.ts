'use server'

// Generating the PM report PDF. Every report is kept: generating again makes
// a new version beside the old ones, so what was sent last month can still
// be opened next year.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { buildPmReport, type ReportPhoto } from '@/lib/pm/report'
import { PM_BUCKET, fail, loadPmBundle, loadTechs, logPm, pmCtx, recalcPm, signPaths } from '@/lib/pm/server'

const MAX_PHOTOS = 36
const EMBEDDABLE = new Set(['image/jpeg', 'image/png'])

export async function generatePmReport(input: { pmId: string }) {
  try {
    const { supabase, companyId, userId, userName } = await pmCtx()
    const { data: can } = await supabase.rpc('pm_can_work', { p_pm: input.pmId })
    if (!can) return { ok: false as const, error: 'Only the assigned technician or a coordinator can generate this report.' }
    await recalcPm(companyId, input.pmId, userId)
    const admin = createAdminClient()
    const b = await loadPmBundle(admin, companyId, input.pmId)
    if (!b) return { ok: false as const, error: 'That PM is gone.' }
    if (!b.template) return { ok: false as const, error: 'The checklist has not been started, so there is nothing to report yet.' }

    const [techs, { data: people }, { data: company }, { data: last }] = await Promise.all([
      loadTechs(admin, companyId),
      admin.from('profiles').select('id, full_name').eq('company_id', companyId),
      admin.from('companies').select('name').eq('id', companyId).single(),
      admin.from('pm_reports').select('version').eq('pm_id', input.pmId).order('version', { ascending: false }).limit(1),
    ])
    const names = Object.fromEntries((people ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? '').trim() || 'Someone']))
    const codeOf = new Map(b.items.map((i) => [i.id, i.code]))

    // Photos tied to a check or a deficiency, in checklist order.
    const order = new Map(b.items.map((i, n) => [i.id, n]))
    const candidates = b.attachments.filter((a) => a.kind === 'photo' && (a.itemId || a.deficiencyId))
      .sort((x, y) => (order.get(x.itemId ?? '') ?? 999) - (order.get(y.itemId ?? '') ?? 999))
    const usable = candidates.filter((a) => EMBEDDABLE.has(a.mime ?? ''))
    const photos: ReportPhoto[] = []
    for (const a of usable.slice(0, MAX_PHOTOS)) {
      const { data } = await admin.storage.from(PM_BUCKET).download(a.path)
      if (!data) continue
      const def = a.deficiencyId ? b.deficiencies.find((d) => d.id === a.deficiencyId) : null
      photos.push({
        bytes: new Uint8Array(await data.arrayBuffer()), mime: a.mime ?? 'image/jpeg',
        caption: def ? `Deficiency${def.itemCode ? ` ${def.itemCode}` : ''}: ${def.description}` : `${codeOf.get(a.itemId ?? '') ?? ''}${a.caption ? `: ${a.caption}` : ''}`,
      })
    }

    const version = ((last?.[0]?.version as number | undefined) ?? 0) + 1
    const bytes = await buildPmReport({
      company: (company?.name as string | undefined) ?? 'PhaseForge', store: b.store, cycle: b.cycle, template: b.template, items: b.items,
      responses: b.responses, readings: b.readings, deficiencies: b.deficiencies, materials: b.materials, progress: b.progress,
      techName: techs.find((t) => t.id === b.cycle.techId)?.name ?? null, names, photos, photosLeftOut: candidates.length - photos.length,
      version, generatedBy: userName, generatedAt: new Date().toISOString(),
    })

    const safeStore = b.store.storeNumber.replace(/[^A-Za-z0-9-]+/g, '')
    const path = `pm/${companyId}/${input.pmId}/reports/PM-Report-${safeStore}-Q${b.cycle.quarter}-${b.cycle.year}-v${version}.pdf`
    const up = await admin.storage.from(PM_BUCKET).upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false })
    if (up.error) return { ok: false as const, error: up.error.message }
    const { error } = await admin.from('pm_reports').insert({
      company_id: companyId, pm_id: input.pmId, version, path, size_bytes: bytes.length,
      checklist_done: b.progress.checklistDone, checklist_total: b.progress.checklistTotal, generated_by: userId,
    })
    if (error) { await admin.storage.from(PM_BUCKET).remove([path]); return { ok: false as const, error: error.message } }
    await logPm(admin, { companyId, storeId: b.store.id, pmId: input.pmId, actorId: userId, action: 'report_generated', detail: { version } })
    const urls = await signPaths([path], companyId)
    revalidatePath(`/app/pm/jobs/${input.pmId}`)
    return { ok: true as const, version, url: urls[path] ?? null, photos: photos.length, photosLeftOut: candidates.length - photos.length }
  } catch (e) {
    logger.error('pm generatePmReport', e)
    return fail(e)
  }
}
