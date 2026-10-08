// The completed PM report, as a real PDF. It carries everything on the ALDI
// sheet (store, job, every check with its result, the refrigeration and HVAC
// readings, the electrical chart, technician comments) plus what the sheet
// has no room for: deficiencies, materials, and the inspection photos.
//
// It is built for the coordinator to review and attach to the PM work order
// in ServiceChannel. PhaseForge does not submit it anywhere.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { itemApplies, type Progress } from './progress'
import { fmtDate, quarterMonths } from './quarters'
import { isNotesTable, rowLabels, rowsFor } from './template'
import {
  MATERIAL_STATUS_LABEL, PROPOSAL_LABEL, REPAIR_LABEL, SEVERITY_LABEL, STATUS_LABEL, SYSTEM_LABEL,
  type DataTable, type PmCycle, type PmDeficiency, type PmMaterial, type PmReading, type PmResponse, type PmStore, type TemplateItem, type TemplateVersion,
} from './types'

export interface ReportPhoto { bytes: Uint8Array; mime: string; caption: string }

export interface ReportData {
  company: string
  store: PmStore
  cycle: PmCycle
  template: TemplateVersion
  items: TemplateItem[]
  responses: PmResponse[]
  readings: PmReading[]
  deficiencies: PmDeficiency[]
  materials: PmMaterial[]
  progress: Progress
  techName: string | null
  names: Record<string, string>
  photos: ReportPhoto[]
  photosLeftOut: number
  version: number
  generatedBy: string
  /** Shown as the generated date, in the coordinator's local time. */
  generatedAt: string
}

const W = 612
const H = 792
const M = 36
const INK = rgb(0.06, 0.09, 0.16)
const MUTED = rgb(0.39, 0.45, 0.55)
const LINE = rgb(0.8, 0.84, 0.88)
const NAVY = rgb(0, 0.13, 0.4)
const BAND = rgb(0.93, 0.95, 0.98)

/**
 * The built-in PDF fonts only know Western characters. Anything else is
 * swapped for the nearest plain equivalent so a stray symbol in a note can
 * never stop a report from generating.
 */
export function pdfSafe(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/[✓✔]/g, 'x').replace(/ /g, ' ').replace(/\t/g, ' ')
    .replace(/[^\x20-\x7E¡-ÿ\n]/g, '')
}

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of pdfSafe(text).split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue }
      if (line) out.push(line)
      // A single word wider than the column is cut to fit.
      let rest = word
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let n = rest.length - 1
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--
        out.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      line = rest
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

const RESULT_TEXT: Record<string, string> = { pass: 'PASS', fail: 'FAIL', na: 'N/A' }

export async function buildPmReport(d: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)
  const label = `Store ${d.store.storeNumber}  |  Q${d.cycle.quarter} ${d.cycle.year}  |  ${d.cycle.jobNumber ? `Job ${d.cycle.jobNumber}` : 'No job number'}`
  doc.setTitle(pdfSafe(`PM Report ${d.store.storeNumber} Q${d.cycle.quarter} ${d.cycle.year}`))
  doc.setAuthor(pdfSafe(d.company))
  doc.setCreator('PhaseForge')

  let page!: PDFPage
  let y = 0
  const newPage = () => {
    page = doc.addPage([W, H])
    page.drawRectangle({ x: 0, y: H - 46, width: W, height: 46, color: NAVY })
    page.drawText('ALDI HVACR Preventative Maintenance Report', { x: M, y: H - 22, size: 12, font: bold, color: rgb(1, 1, 1) })
    page.drawText(pdfSafe(label), { x: M, y: H - 37, size: 8.5, font, color: rgb(0.85, 0.9, 1) })
    y = H - 64
  }
  const need = (h: number) => { if (y - h < M + 18) newPage() }
  const text = (s: string, x: number, size = 9, f: PDFFont = font, color = INK) => page.drawText(pdfSafe(s), { x, y, size, font: f, color })
  const heading = (s: string) => {
    need(34)
    y -= 6
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 17, color: NAVY })
    page.drawText(pdfSafe(s), { x: M + 6, y, size: 10, font: bold, color: rgb(1, 1, 1) })
    y -= 20
  }
  const sub = (s: string) => {
    need(26)
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 14, color: BAND })
    page.drawText(pdfSafe(s), { x: M + 6, y, size: 9, font: bold, color: INK })
    y -= 17
  }
  const para = (s: string, opts: { x?: number; width?: number; size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = opts.size ?? 9
    const x = opts.x ?? M
    const lines = wrapText(s, opts.f ?? font, size, opts.width ?? W - M - x)
    for (const l of lines) { need(size + 3); page.drawText(l, { x, y, size, font: opts.f ?? font, color: opts.color ?? INK }); y -= size + 3 }
    y -= opts.gap ?? 0
  }
  /** Label and value pairs in columns. */
  const facts = (pairs: [string, string | null | undefined][], cols = 3) => {
    const colW = (W - 2 * M) / cols
    for (let i = 0; i < pairs.length; i += cols) {
      const row = pairs.slice(i, i + cols)
      const heights = row.map(([, v]) => wrapText(v || '-', font, 9, colW - 8).length)
      const h = 11 + Math.max(...heights) * 11 + 3
      need(h)
      row.forEach(([k, v], c) => {
        const x = M + c * colW
        page.drawText(pdfSafe(k.toUpperCase()), { x, y, size: 6.5, font: bold, color: MUTED })
        wrapText(v || '-', font, 9, colW - 8).forEach((l, n) => page.drawText(l, { x, y: y - 11 - n * 11, size: 9, font, color: INK }))
      })
      y -= h
    }
  }
  /** A ruled grid. `widths` are fractions of the usable width. */
  const grid = (head: string[], rows: string[][], widths: number[], size = 8) => {
    const usable = W - 2 * M
    const xs = widths.reduce<number[]>((acc, w, i) => [...acc, (acc[i - 1] ?? M) + (i ? widths[i - 1] * usable : 0)], [])
    const drawRow = (cells: string[], f: PDFFont, fill?: ReturnType<typeof rgb>) => {
      const lines = cells.map((c, i) => wrapText(c, f, size, widths[i] * usable - 6))
      const h = Math.max(...lines.map((l) => l.length)) * (size + 2) + 5
      need(h)
      if (fill) page.drawRectangle({ x: M, y: y - h + size + 1, width: usable, height: h, color: fill })
      lines.forEach((ls, i) => ls.forEach((l, n) => page.drawText(l, { x: xs[i] + 3, y: y - n * (size + 2), size, font: f, color: INK })))
      page.drawLine({ start: { x: M, y: y - h + size + 1 }, end: { x: M + usable, y: y - h + size + 1 }, thickness: 0.5, color: LINE })
      y -= h
    }
    need(40)
    drawRow(head, bold, BAND)
    for (const r of rows) drawRow(r, font)
    y -= 6
  }

  const today = d.generatedAt.slice(0, 10)
  const day = (s: string | null | undefined) => (s ? fmtDate(s, '1900-01-01') : '')
  const responses = new Map(d.responses.map((r) => [r.itemId, r]))
  const value = (table: string, row: string, col: string) => d.readings.find((r) => r.tableKey === table && r.rowKey === row && r.colKey === col)?.value ?? ''

  /* ── Page 1: the job ── */
  newPage()
  text(`Store ${d.store.storeNumber}`, M, 18, bold)
  y -= 16
  text([d.store.address, d.store.city, d.store.state, d.store.postalCode].filter(Boolean).join(', ') || 'No address on file', M, 10, font, MUTED)
  y -= 20
  facts([
    ['Quarter', `Q${d.cycle.quarter} ${d.cycle.year} (${quarterMonths(d.cycle.quarter)})`],
    ['Kalos job number', d.cycle.jobNumber ?? 'Not received'],
    ['ServiceChannel work order', d.cycle.scWorkOrder],
    ['Status', STATUS_LABEL[d.cycle.status]],
    ['Technician', d.techName],
    ['Service provider', d.cycle.serviceProvider || d.company],
    ['Scheduled visit', day(d.cycle.scheduledDate)],
    ['Started', day(d.cycle.actualStart)],
    ['Date of completion', day(d.cycle.actualEnd)],
    ['Time in', d.cycle.timeIn],
    ['Time out', d.cycle.timeOut],
    ['FM spot checked completion', d.cycle.fmSpotChecked === null ? 'Not recorded' : d.cycle.fmSpotChecked ? 'Yes' : 'No'],
    ['ALDI facility manager', d.store.facilityManager],
    ['Refrigeration system', d.store.systemType ? SYSTEM_LABEL[d.store.systemType] : 'Not recorded'],
    ['Region', d.store.region],
  ])
  y -= 4
  facts([
    ['Checklist', `${d.progress.checklistPct}%  (${d.progress.checklistDone} of ${d.progress.checklistTotal} applicable checks)`],
    ['Required documentation', `${d.progress.docsPct}%  (${d.progress.docsDone} of ${d.progress.docsTotal})`],
    ['Failed checks', String(d.progress.fails)],
    ['Checklist version', `${d.template.name}, Quarter ${d.template.quarter}${d.template.revisionLabel ? `, ${d.template.revisionLabel}` : ''}`],
    ['Open deficiencies', String(d.deficiencies.filter((x) => !['repaired', 'closed', 'declined'].includes(x.repairStatus)).length)],
    ['Report', `Version ${d.version}, generated ${day(today)} by ${d.generatedBy}`],
  ])

  /* ── The checklist ── */
  heading('Checklist results')
  const sections: { key: string; label: string }[] = []
  for (const it of d.items) if (!sections.some((s) => s.key === it.sectionKey)) sections.push({ key: it.sectionKey, label: it.sectionLabel })
  const C = { code: M + 3, desc: M + 66, result: W - M - 44 }
  for (const s of sections) {
    sub(s.label)
    for (const it of d.items.filter((i) => i.sectionKey === s.key)) {
      const ev = d.progress.byId[it.id]
      const r = responses.get(it.id)
      const applies = itemApplies(it.applicability, d.store.systemType)
      const desc = wrapText(it.description, font, 8, C.result - C.desc - 8)
      const extra: string[] = []
      if (ev?.state === 'excluded') extra.push(`Left off this store's checklist: ${ev.excludedWhy ?? ''}`)
      if (r?.result === 'na' && r.naReason) extra.push(`Not applicable: ${r.naReason}`)
      if (r?.measureValue) extra.push(`${it.measureLabel ?? 'Value'}: ${r.measureValue}${it.measureUnit ?? ''}`)
      if (r?.note) extra.push(`Note: ${r.note}`)
      if (ev?.missing.length && r?.result) extra.push(`Missing: ${ev.missing.join(', ')}`)
      const extraLines = extra.flatMap((e) => wrapText(e, italic, 7.5, C.result - C.desc - 8))
      const excluded = ev?.state === 'excluded'
      const dated = !!(r?.inspectedAt && r.result && !excluded)
      const labelled = !!(it.applicability && it.applicability !== 'ALL')
      // Room for the second line under the code or the result, even on a one-line check.
      const h = Math.max(desc.length * 10 + extraLines.length * 9.5, dated || labelled ? 19 : 10) + 5
      need(h)
      page.drawText(pdfSafe(it.code), { x: C.code, y, size: 8, font: bold, color: INK })
      if (labelled) page.drawText(pdfSafe(it.applicability), { x: C.code, y: y - 9, size: 6.5, font: italic, color: MUTED })
      desc.forEach((l, n) => page.drawText(l, { x: C.desc, y: y - n * 10, size: 8, font, color: applies ? INK : MUTED }))
      extraLines.forEach((l, n) => page.drawText(l, { x: C.desc, y: y - desc.length * 10 - n * 9.5, size: 7.5, font: italic, color: MUTED }))
      const res = excluded ? 'N/A' : r?.result ? RESULT_TEXT[r.result] : '-'
      const color = res === 'FAIL' ? rgb(0.75, 0.1, 0.1) : res === 'PASS' ? rgb(0.02, 0.45, 0.25) : MUTED
      page.drawText(res, { x: C.result, y, size: 9, font: bold, color })
      if (dated) page.drawText(pdfSafe(day(r!.inspectedAt)), { x: C.result, y: y - 9, size: 6.5, font, color: MUTED })
      page.drawLine({ start: { x: M, y: y - h + 9 }, end: { x: W - M, y: y - h + 9 }, thickness: 0.4, color: LINE })
      y -= h
    }
    y -= 4
  }

  /* ── The data entry pages ── */
  const tableOut = (t: DataTable) => {
    const named = rowLabels(rowsFor(t, d.cycle.layout))
    const rows = rowsFor(t, d.cycle.layout).map((r) => ({ ...r, label: named[r.key] ?? r.label }))
    if (isNotesTable(t)) {
      for (const r of rows) {
        const v = value(t.key, r.key, 'text')
        if (!v) continue
        need(24)
        text(r.label.toUpperCase(), M, 6.5, bold, MUTED); y -= 11
        para(v, { gap: 4 })
      }
      return
    }
    need(60)
    sub(t.title)
    if (t.hint) para(t.hint, { size: 7.5, f: italic, color: MUTED, gap: 2 })
    if (t.rowSource === 'compressors' || t.rowSource === 'hvac_compressors') {
      // Laid out like the sheet: one column per compressor.
      const first = 0.28
      const each = (1 - first) / Math.max(1, rows.length)
      grid(['', ...rows.map((r) => r.label)], t.columns.map((c) => [c.label, ...rows.map((r) => value(t.key, r.key, c.key))]), [first, ...rows.map(() => each)], rows.length > 5 ? 7 : 8)
    } else {
      const first = 0.34
      const each = (1 - first) / t.columns.length
      grid(['', ...t.columns.map((c) => c.label + (c.unit ? ` (${c.unit})` : ''))], rows.map((r) => [r.label, ...t.columns.map((c) => value(t.key, r.key, c.key))]), [first, ...t.columns.map(() => each)])
    }
  }
  for (const [group, title] of [['refrigeration', 'Refrigeration Data Entry'], ['electrical', 'Electrical Readings'], ['hvac', 'HVAC Data Entry']] as const) {
    const tables = d.template.dataTables.filter((t) => t.group === group)
    if (!tables.length) continue
    heading(`${title} (Q${d.cycle.quarter})`)
    tables.forEach(tableOut)
  }

  /* ── Comments ── */
  heading('Service Technician Comments')
  const commented = d.items.filter((it) => { const r = responses.get(it.id); return r && (r.note || r.measureValue) })
  if (commented.length) {
    grid(['PM ID', 'Notes'], commented.map((it) => {
      const r = responses.get(it.id)!
      return [it.code, [r.measureValue && `${it.measureLabel ?? 'Value'} ${r.measureValue}${it.measureUnit ?? ''}`, r.note].filter(Boolean).join('. ')]
    }), [0.16, 0.84])
  }
  if (d.cycle.techNotes) { text('TECHNICIAN NOTES', M, 6.5, bold, MUTED); y -= 11; para(d.cycle.techNotes, { gap: 6 }) }
  if (d.cycle.returnVisitNeeded) para(`Return visit needed${d.cycle.returnVisitNote ? `: ${d.cycle.returnVisitNote}` : '.'}`, { f: bold, gap: 6 })
  if (!commented.length && !d.cycle.techNotes) para('No comments recorded.', { color: MUTED, gap: 4 })

  /* ── Deficiencies and materials ── */
  heading(`Deficiencies (${d.deficiencies.length})`)
  if (!d.deficiencies.length) para('None recorded on this PM.', { color: MUTED, gap: 4 })
  for (const x of d.deficiencies) {
    need(40)
    text(`${x.itemCode ? `${x.itemCode}  ` : ''}${SEVERITY_LABEL[x.severity]} severity${x.equipmentLabel ? `  |  ${x.equipmentLabel}` : ''}`, M, 9, bold); y -= 12
    para(x.description, { gap: 1 })
    if (x.recommendedRepair) para(`Recommended repair: ${x.recommendedRepair}`, { f: italic, color: MUTED, gap: 1 })
    para([
      x.proposalStatus !== 'not_required' ? PROPOSAL_LABEL[x.proposalStatus] + (x.proposalSubmittedDate ? ` ${day(x.proposalSubmittedDate)}` : '') : '',
      `Repair: ${REPAIR_LABEL[x.repairStatus]}`, x.returnVisitRequired ? 'Return visit required' : '', x.followupJobNumber ? `Follow-up job ${x.followupJobNumber}` : '',
      `Found ${day(x.createdAt)}${x.createdBy && d.names[x.createdBy] ? ` by ${d.names[x.createdBy]}` : ''}`,
    ].filter(Boolean).join('   |   '), { size: 7.5, color: MUTED, gap: 7 })
  }
  if (d.materials.length) {
    heading(`Filters and parts (${d.materials.length})`)
    grid(['Material', 'Qty', 'Part number', 'For', 'Status', 'Dates'], d.materials.map((m) => [
      m.name, String(m.quantity), m.partNumber ?? '', m.unitLabel ?? '', MATERIAL_STATUS_LABEL[m.status],
      [m.orderedDate && `Ordered ${day(m.orderedDate)}`, m.receivedDate && `Received ${day(m.receivedDate)}`, m.installedDate && `Installed ${day(m.installedDate)}`].filter(Boolean).join(', ') || `Requested ${day(m.requestedDate)}`,
    ]), [0.28, 0.07, 0.15, 0.16, 0.14, 0.2], 7.5)
  }

  /* ── Photos ── */
  if (d.photos.length || d.photosLeftOut) {
    const images: { img: PDFImage; caption: string }[] = []
    for (const p of d.photos) {
      try { images.push({ img: p.mime === 'image/png' ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes), caption: p.caption }) } catch { /* an unreadable image is skipped, the report still builds */ }
    }
    if (images.length) {
      heading(`Inspection photos (${images.length})`)
      const cols = 2
      const cellW = (W - 2 * M - 12) / cols
      const cellH = 196
      for (let i = 0; i < images.length; i += cols) {
        need(cellH + 30)
        images.slice(i, i + cols).forEach(({ img, caption }, c) => {
          const scale = Math.min(cellW / img.width, cellH / img.height)
          const w = img.width * scale
          const h = img.height * scale
          const x = M + c * (cellW + 12)
          page.drawImage(img, { x: x + (cellW - w) / 2, y: y - h, width: w, height: h })
          wrapText(caption, font, 7.5, cellW).slice(0, 2).forEach((l, n) => page.drawText(l, { x, y: y - cellH - 10 - n * 9, size: 7.5, font, color: MUTED }))
        })
        y -= cellH + 32
      }
    }
    if (d.photosLeftOut) para(`${d.photosLeftOut} more ${d.photosLeftOut === 1 ? 'photo is' : 'photos are'} attached to the PM in PhaseForge and not printed here.`, { color: MUTED })
  }

  /* ── Footers ── */
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M }, end: { x: W - M, y: M }, thickness: 0.5, color: LINE })
    p.drawText(pdfSafe(`${d.company}  |  ${label}`), { x: M, y: M - 11, size: 7, font, color: MUTED })
    const n = `Page ${i + 1} of ${pages.length}`
    p.drawText(n, { x: W - M - font.widthOfTextAtSize(n, 7), y: M - 11, size: 7, font, color: MUTED })
  })
  return doc.save({ useObjectStreams: true })
}
