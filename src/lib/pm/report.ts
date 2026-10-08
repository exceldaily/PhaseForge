// The PM report: ALDI's own HVACR Preventative Maintenance Checklist, filled in.
//
// The four pages are ALDI's blank form (see aldiForm.ts), not a redrawing of
// it. This file only writes answers into the cells: the Store and Date boxes,
// a mark beside every check, the refrigeration, electrical, and HVAC data
// entry tables, and the Service Technician Comments rows. A PM with nothing
// answered therefore prints as the blank sheet, and a store with different
// equipment prints its own circuits and compressors in the rows.
//
// Anything that cannot fit in the form's rows goes on a continuation page
// after it, and the inspection photos follow. PhaseForge does not submit the
// report anywhere: the coordinator attaches it in ServiceChannel.

import {
  PDFArray, PDFDocument, PDFHexString, PDFName, PDFRawStream, StandardFonts, beginText, decodePDFRawStream, endText, moveText, rgb, setFillingRgbColor, setFontAndSize, showText,
  type PDFFont, type PDFImage, type PDFPage, type PDFRef,
} from 'pdf-lib'
import { ALDI_CHECK_ROWS, ALDI_CIRCUIT_ROWS, ALDI_FONT_WIDTHS, ALDI_FORM_PDF_BASE64 } from './aldiForm'
import type { Progress } from './progress'
import type {
  DataRow, PmCycle, PmDeficiency, PmMaterial, PmReading, PmResponse, PmStore, TemplateItem, TemplateVersion,
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
  generatedAt: string
}

/**
 * The built-in PDF fonts only know Western characters. Anything else is
 * swapped for the nearest plain equivalent so a stray symbol in a note can
 * never stop a report from generating.
 */
export function pdfSafe(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/[✓✔]/g, 'x').replace(/ /g, ' ').replace(/\t/g, ' ')
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

/* ── The form's geometry (PDF points, 1054 x 1366 page, origin bottom left) ── */

const PAGE_W = 1054
const PAGE_H = 1366
const INK = rgb(0, 0, 0)
const RED = rgb(0.78, 0.05, 0.05)
const WHITE = rgb(1, 1, 1)
const COMP_GRAY = rgb(0.650391, 0.650391, 0.650391)
const ELEC_GRAY = rgb(0.634766, 0.634766, 0.634766)
const NAVY = rgb(0, 0.11792, 0.470947)

/** Center of the answer column on the two checklist pages. */
const MARK_X = 968.5
/** WICF8's answer cell already holds ALDI's "Link to Order form": its answer goes beside the second line of that. */
const MARK_SHIFT: Record<string, { dx: number; dy: number }> = { WICF8: { dx: 18, dy: -10.5 } }
/** Values in the tall circuit rows sit a little above the row's label baseline, as on a hand-filled sheet. */
const CIRCUIT_LIFT = 4
/** Column edges of the compressor tables on the data entry page. */
const COMP_EDGES = [119.5, 269.4, 396.4, 520.7, 651, 789.4, 933.5]
const COMP_CENTERS = COMP_EDGES.slice(0, 6).map((x, i) => (x + COMP_EDGES[i + 1]) / 2)
/** The three value columns shared by the circuit table and the HVAC tables. */
const VALUE_CENTERS = [332.9, 458.6, 585.9]
const VALUE_WIDTH = 118

const OIL_ROWS: Record<string, number> = { oil_compressor: 589.2, oil_reservoir: 575.5, discharge_temp: 561.8 }
const ELECTRICAL_ROWS: Record<string, number> = {
  fla: 512.9, l1_v: 491.6, l2_v: 476.8, l3_v: 462.5, l1l2_v: 448.8, l2l3_v: 435.3, l3l1_v: 421.6, l1l2_ohm: 407.9, l2l3_ohm: 394.2, l3l1_ohm: 380.6,
  l1_a: 366.9, l2_a: 353.2, l3_a: 339.5, l1_prior: 326, l2_prior: 312.3, l3_prior: 298.6,
}
const HVAC_AMP_ROWS = [1188.6, 1175, 1161.3, 1147.7]
const HVAC_SENSOR_ROWS: Record<string, number> = { space: 1105.8, wb: 1091.7, oat: 1077.6, rat: 1063.6, co2: 1049.4 }
/** Comment lines beside the superheat tables: five header-height rows, then one per circuit row. */
const REFRIG_COMMENT_ROWS = [1218.3, 1193.4, 1168.6, 1144.1, 1119, ...ALDI_CIRCUIT_ROWS.map((r) => r.y + 4)]
/** Service Technician Comments: the first empty row under the "Ex. COMP5" example, and the row pitch. */
const TECH_ROW_TOP = 767
const TECH_ROW_PITCH = 13.667
const TECH_ROWS = 34

const QUARTER_MONTHS = ['JANUARY / FEBRUARY / MARCH', 'APRIL / MAY / JUNE', 'JULY / AUGUST / SEPTEMBER', 'OCTOBER / NOVEMBER / DECEMBER']

const FORM_MONTHS_LINE = "For PM's being completed inside the following months: "
const aldiTextWidth = (key: 'R7' | 'R9', text: string, size: number): number | null => {
  let w = 0
  for (const ch of text) { const g = ALDI_FONT_WIDTHS[key][ch]; if (g === undefined) return null; w += g }
  return (w / 1000) * size
}

/**
 * The form is printed for Quarter 2. For another quarter its own wording is
 * rewritten in place, "QUARTER 2", the months line, and every "Q2" label, so
 * the page reads as that quarter's sheet in ALDI's own lettering, with no
 * patch laid over the top.
 */
function relabelQuarter(doc: PDFDocument, quarter: number) {
  const months = QUARTER_MONTHS[quarter - 1]
  const was = FORM_MONTHS_LINE + QUARTER_MONTHS[1]
  const now = FORM_MONTHS_LINE + months
  // The months line is placed by its left edge: keep it centered where it was.
  const shift = ((aldiTextWidth('R7', was, 10.575) ?? 0) - (aldiTextWidth('R7', now, 10.575) ?? 0)) / 2
  for (const page of doc.getPages()) {
    const contents = page.node.Contents()
    const refs = (contents instanceof PDFArray ? contents.asArray() : []) as PDFRef[]
    for (const ref of refs) {
      const stream = doc.context.lookup(ref)
      if (!(stream instanceof PDFRawStream)) continue
      const before = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
      const after = before
        .replace(/\(QUARTER 2\)/g, `(QUARTER ${quarter})`)
        .replace(/\(Q2\)/g, `(Q${quarter})`)
        .replace(/\\\(Q2\\\)/g, `\\(Q${quarter}\\)`)
        .replace(/([\d.]+) ([\d.]+) Td\n0 Ts\n\(For PM's being completed inside the following months: APRIL \/ MAY \/ JUNE\)/, (_, x: string, y: string) => `${(Number(x) + shift).toFixed(2)} ${y} Td\n0 Ts\n(${now})`)
      if (after !== before) doc.context.assign(ref, doc.context.flateStream(Uint8Array.from(Buffer.from(after, 'latin1'))))
    }
  }
}

const usDate = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[2]}/${m[3]}/${m[1]}` : ''
}

export async function buildPmReport(d: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.load(Uint8Array.from(Buffer.from(ALDI_FORM_PDF_BASE64, 'base64')))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)
  const [p1, p2, p3, p4] = doc.getPages()
  const q = d.cycle.quarter >= 1 && d.cycle.quarter <= 4 ? d.cycle.quarter : 2
  const job = d.cycle.jobNumber ? `Job ${d.cycle.jobNumber}` : ''
  doc.setTitle(`ALDI PM Checklist ${d.store.storeNumber} Q${q} ${d.cycle.year}`)
  doc.setAuthor(pdfSafe(d.company))
  doc.setSubject(pdfSafe(`Store ${d.store.storeNumber}, Q${q} ${d.cycle.year}${job ? `, ${job}` : ''}, report version ${d.version}`))
  doc.setCreator('PhaseForge')
  doc.setProducer('PhaseForge')

  /* ── Small drawing helpers ── */

  /** One line of text, shrunk if needed so it never leaves its cell. */
  const put = (page: PDFPage, text: string | null | undefined, x: number, y: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; align?: 'left' | 'center' } = {}) => {
    const s = pdfSafe(text).replace(/\n/g, ' ').trim()
    if (!s) return
    const f = o.f ?? font
    let size = o.size ?? 9
    if (o.width) while (size > 5 && f.widthOfTextAtSize(s, size) > o.width) size -= 0.25
    let line = s
    if (o.width) while (line.length > 1 && f.widthOfTextAtSize(line, size) > o.width) line = line.slice(0, -1)
    const w = f.widthOfTextAtSize(line, size)
    page.drawText(line, { x: o.align === 'center' ? x - w / 2 : x, y, size, font: f, color: o.color ?? INK })
  }
  const cover = (page: PDFPage, x: number, y: number, w: number, h: number, color = WHITE) => page.drawRectangle({ x, y, width: w, height: h, color })

  /**
   * Text in ALDI's own typeface, which is embedded in the form (R7 regular,
   * R9 bold). The embedded copy only holds the letters the form uses, so
   * anything it lacks falls back to Helvetica.
   */
  const aldiWidth = aldiTextWidth
  const aldi = (page: PDFPage, key: 'R7' | 'R9', text: string, x: number, y: number, size: number, o: { align?: 'left' | 'center'; color?: [number, number, number] } = {}) => {
    const w = aldiWidth(key, text, size)
    if (w === null) { put(page, text, x, y, { size: size * 0.92, f: key === 'R9' ? bold : font, align: o.align, color: o.color ? rgb(...o.color) : INK }); return }
    const [r, g, b] = o.color ?? [0, 0, 0]
    const hex = [...text].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    page.pushOperators(beginText(), setFillingRgbColor(r, g, b), setFontAndSize(PDFName.of(key), size), moveText(o.align === 'center' ? x - w / 2 : x, y), showText(PDFHexString.of(hex)), endText())
  }
  const check = (page: PDFPage, cx: number, cy: number) => {
    const opts = { thickness: 1.5, color: INK }
    page.drawLine({ start: { x: cx - 4.2, y: cy + 0.2 }, end: { x: cx - 1.3, y: cy - 3.2 }, ...opts })
    page.drawLine({ start: { x: cx - 1.3, y: cy - 3.2 }, end: { x: cx + 4.6, y: cy + 4.4 }, ...opts })
  }

  if (q !== 2) relabelQuarter(doc, q)

  /* ── Page 1 header ── */
  put(p1, d.store.storeNumber, 206, 1170, { size: 12, f: bold, width: 180 })
  put(p1, usDate(d.cycle.actualStart ?? d.cycle.actualEnd), 531, 1170, { size: 12, f: bold })

  /* ── The checks ── */
  const byItem = new Map(d.responses.map((r) => [r.itemId, r]))
  const comments: { id: string; text: string }[] = []
  for (const it of d.items) {
    const ev = d.progress.byId[it.id]
    const r = byItem.get(it.id)
    const excluded = ev?.state === 'excluded'
    const result = excluded ? 'na' : r?.result ?? null
    // A check written as a question ("Is there any physical damage?") is answered Yes or No.
    const question = it.description.trim().endsWith('?')
    const cell = ALDI_CHECK_ROWS[it.code]
    if (cell) {
      const page = cell.page === 0 ? p1 : p2
      const mx = MARK_X + (MARK_SHIFT[it.code]?.dx ?? 0)
      const my = cell.y + (MARK_SHIFT[it.code]?.dy ?? 0)
      if (result === 'pass') { if (question) put(page, 'No', mx, my, { size: 9, f: bold, align: 'center' }); else check(page, mx, my + 3.4) }
      else if (result === 'fail') put(page, question ? 'Yes' : 'FAIL', mx, my, { size: 9, f: bold, align: 'center', color: RED })
      else if (result === 'na') put(page, 'N/A', mx, my, { size: 9, f: bold, align: 'center' })
    } else if (result) {
      // A check added in a later revision has no row on this form: it is reported in the comments.
      comments.push({ id: it.code, text: `${result === 'pass' ? 'Completed' : result === 'fail' ? 'FAILED' : 'N/A'}: ${it.description}` })
    }
    const notes: string[] = []
    if (r?.measureValue) notes.push(`${it.measureLabel ?? 'Value'} ${r.measureValue}${it.measureUnit && !r.measureValue.includes(it.measureUnit) ? it.measureUnit : ''}`)
    if (r?.note) notes.push(r.note)
    if (excluded && ev?.excludedWhy) notes.push(`N/A: ${ev.excludedWhy}`)
    else if (r?.result === 'na' && r.naReason) notes.push(`N/A: ${r.naReason}`)
    if (notes.length) comments.push({ id: it.code, text: notes.join('. ') })
  }

  /* ── Data entry: refrigeration and electrical (page 3) ── */
  const reading = new Map(d.readings.map((r) => [`${r.tableKey}|${r.rowKey}|${r.colKey}`, r.value]))
  const val = (t: string, row: string, col: string) => reading.get(`${t}|${row}|${col}`) ?? ''
  const table = (key: string) => d.template.dataTables.find((t) => t.key === key)
  const layoutRows = (source: 'circuits' | 'compressors' | 'hvac_compressors', tableKey: string): DataRow[] => {
    const own = d.cycle.layout?.[source]
    return own?.length ? own : table(tableKey)?.rows ?? []
  }
  /** Rows that do not fit on the form, printed on the continuation page. */
  const overflow: { title: string; lines: string[] }[] = []

  put(p3, val('system_superheat', 'lt', 'reading'), 395, 1193.4, { size: 11, f: bold, align: 'center', width: 240 })
  put(p3, val('system_superheat', 'mt', 'reading'), 395, 1168.6, { size: 11, f: bold, align: 'center', width: 240 })

  const circuits = layoutRows('circuits', 'component')
  const extraCircuits: string[] = []
  ALDI_CIRCUIT_ROWS.forEach((row, i) => {
    const c = circuits[i]
    // The form prints one store's circuits. Another store's own list replaces them, row for row.
    if (!c || c.label.trim() !== row.label) {
      cover(p3, 32.6, row.y - 1.5, row.w + 5, 11.5)
      if (c) aldi(p3, 'R9', pdfSafe(c.label).slice(0, 34), 33.5, row.y, 11)
    }
    if (!c) return
    put(p3, val('component', c.key, 'superheat'), VALUE_CENTERS[0], row.y + CIRCUIT_LIFT, { align: 'center', width: VALUE_WIDTH })
    put(p3, val('component', c.key, 'cfm'), VALUE_CENTERS[1], row.y + CIRCUIT_LIFT, { align: 'center', width: VALUE_WIDTH })
  })
  for (const c of circuits.slice(ALDI_CIRCUIT_ROWS.length)) {
    const sh = val('component', c.key, 'superheat'); const cfm = val('component', c.key, 'cfm')
    extraCircuits.push(`${c.label}: superheat ${sh || 'not recorded'}, fan CFM ${cfm || 'not recorded'}`)
  }
  if (extraCircuits.length) overflow.push({ title: 'Component Superheat / Fan CFM, more circuits', lines: extraCircuits })

  const refrigComments = wrapText(val('refrigeration_comments', 'comments', 'text'), font, 8.5, 465).filter((l) => l.trim())
  refrigComments.slice(0, REFRIG_COMMENT_ROWS.length).forEach((line, i) => put(p3, line, 762, REFRIG_COMMENT_ROWS[i], { size: 8.5, align: 'center', width: 470 }))
  if (refrigComments.length > REFRIG_COMMENT_ROWS.length) overflow.push({ title: 'Refrigeration Data Entry comments, continued', lines: refrigComments.slice(REFRIG_COMMENT_ROWS.length) })

  const compressors = layoutRows('compressors', 'oil_discharge')
  const printed = (i: number) => `Compressor ${i + 1}`
  COMP_CENTERS.forEach((cx, i) => {
    const c = compressors[i]
    const width = COMP_EDGES[i + 1] - COMP_EDGES[i] - 8
    if (!c || c.label.trim() !== printed(i)) {
      // Two header rows carry the compressor names: one above the oil levels, one above the electrical chart.
      cover(p3, cx - 40, 612.5, 80, 13.5, COMP_GRAY)
      cover(p3, cx - 40, 537.6, 80, 13.5, ELEC_GRAY)
      if (c) {
        const name = pdfSafe(c.label).slice(0, 22)
        const size = (aldiWidth('R9', name, 10.575) ?? width) > width ? 8 : 10.575
        aldi(p3, 'R9', name, cx, 615.8, size, { align: 'center' })
        aldi(p3, 'R9', name, cx, 540.9, size, { align: 'center' })
      }
    }
    if (!c) return
    for (const [col, y] of Object.entries(OIL_ROWS)) put(p3, val('oil_discharge', c.key, col), cx, y, { f: bold, align: 'center', width })
    for (const [col, y] of Object.entries(ELECTRICAL_ROWS)) put(p3, val('electrical', c.key, col), cx, y, { f: bold, align: 'center', width })
  })
  const extraCompressors = compressors.slice(6).map((c) => {
    const cols = [...(table('oil_discharge')?.columns ?? []).map((k) => ['oil_discharge', k] as const), ...(table('electrical')?.columns ?? []).map((k) => ['electrical', k] as const)]
    const got = cols.map(([t, k]) => { const v = val(t, c.key, k.key); return v ? `${k.label} ${v}` : '' }).filter(Boolean)
    return `${c.label}: ${got.join(', ') || 'nothing recorded'}`
  })
  if (extraCompressors.length) overflow.push({ title: 'Oil level, discharge temp, and electrical readings, more compressors', lines: extraCompressors })

  /* ── Data entry: HVAC (page 4) ── */
  const HVAC_COLS = ['l1l2', 'l1l3', 'l2l3']
  HVAC_COLS.forEach((col, i) => put(p4, val('hvac_voltage', 'actual', col), VALUE_CENTERS[i], 1223.7, { align: 'center', width: VALUE_WIDTH }))
  const hvacComps = layoutRows('hvac_compressors', 'hvac_amps')
  HVAC_AMP_ROWS.forEach((y, i) => {
    const c = hvacComps[i]
    if (!c || c.label.trim() !== printed(i)) {
      cover(p4, 115, y - 1.5, 71, 10.6)
      if (c) aldi(p4, 'R9', pdfSafe(c.label).slice(0, 26), 150.5, y, 11, { align: 'center' })
    }
    if (c) HVAC_COLS.forEach((col, n) => put(p4, val('hvac_amps', c.key, col), VALUE_CENTERS[n], y, { align: 'center', width: VALUE_WIDTH }))
  })
  const extraHvac = hvacComps.slice(4).map((c) => `${c.label}: ${HVAC_COLS.map((col) => val('hvac_amps', c.key, col) || '-').join(' / ')} amps (L1 to L2 / L1 to L3 / L2 to L3)`)
  if (extraHvac.length) overflow.push({ title: 'HVAC compressor amps, more compressors', lines: extraHvac })
  for (const [row, y] of Object.entries(HVAC_SENSOR_ROWS)) {
    ;['controller', 'actual', 'offset'].forEach((col, n) => put(p4, val('hvac_sensors', row, col), VALUE_CENTERS[n], y, { align: 'center', width: VALUE_WIDTH }))
  }
  const sideNote = (text: string, top: number, lines: number, title: string) => {
    const wrapped = wrapText(text, font, 8.5, 340).filter((l) => l.trim())
    wrapped.slice(0, lines).forEach((l, i) => put(p4, l, 657, top - i * 13.2, { size: 8.5, width: 344 }))
    if (wrapped.length > lines) overflow.push({ title, lines: wrapped.slice(lines) })
  }
  sideNote(val('hvac_comments', 'rla', 'text'), 1187, 4, 'RLA, Voltage, Comments, continued')
  sideNote(val('hvac_comments', 'additional', 'text'), 1104.5, 5, 'Additional Comments, continued')

  put(p4, d.cycle.serviceProvider || d.company, 460, 994.6, { size: 9.5, align: 'center', width: 370 })
  put(p4, usDate(d.cycle.actualEnd), 861.5, 994.6, { size: 9.5, align: 'center', width: 136 })
  if (d.cycle.fmSpotChecked !== null && d.cycle.fmSpotChecked !== undefined) {
    // "Y/N" is printed on the form: the answer is circled.
    p4.drawEllipse({ x: d.cycle.fmSpotChecked ? 452.6 : 464.2, y: 971.2, xScale: 5.4, yScale: 7.2, borderColor: INK, borderWidth: 1.2 })
  }
  put(p4, d.cycle.timeIn, 276, 893.6, { size: 10, width: 116 })
  put(p4, d.cycle.timeOut, 276, 866.2, { size: 10, width: 116 })

  /* ── Service Technician Comments ── */
  for (const def of d.deficiencies) {
    comments.push({ id: def.itemCode ?? '', text: [def.equipmentLabel ? `${def.equipmentLabel}: ${def.description}` : def.description, def.recommendedRepair ? `Recommended: ${def.recommendedRepair}` : '', def.proposalRequired ? 'FOPM proposal to follow.' : ''].filter(Boolean).join(' ') })
  }
  if (d.cycle.techNotes?.trim()) comments.push({ id: '', text: d.cycle.techNotes.trim() })
  if (d.cycle.returnVisitNeeded) comments.push({ id: '', text: `Return visit needed${d.cycle.returnVisitNote ? `: ${d.cycle.returnVisitNote}` : '.'}` })

  const techLines: { id: string; text: string }[] = []
  for (const c of comments) wrapText(c.text, font, 8.5, 652).filter((l) => l.trim()).forEach((line, i) => techLines.push({ id: i === 0 ? c.id : '', text: line }))
  techLines.slice(0, TECH_ROWS).forEach((l, i) => {
    const y = TECH_ROW_TOP - i * TECH_ROW_PITCH
    put(p4, l.id, 150.6, y, { size: 8.5, align: 'center', width: 226 })
    put(p4, l.text, 274, y, { size: 8.5, width: 655 })
  })
  const techOverflow = techLines.slice(TECH_ROWS)

  /* ── Continuation, when the form's rows run out ── */
  const FOOT = `Store ${d.store.storeNumber}   |   Q${q} ${d.cycle.year}${job ? `   |   ${job}` : ''}`
  const extraPage = (title: string) => {
    const page = doc.addPage([PAGE_W, PAGE_H])
    put(page, 'ALDI HVACR Preventative Maintenance Checklist', PAGE_W / 2, 1304, { size: 24, align: 'center' })
    page.drawRectangle({ x: 31.8, y: 1256, width: 971.7, height: 16, color: NAVY })
    put(page, title, PAGE_W / 2, 1260, { size: 12.5, f: bold, color: WHITE, align: 'center' })
    put(page, FOOT, 33.5, 41, { size: 9.5 })
    return page
  }
  if (techOverflow.length || overflow.length) {
    let page = extraPage(`Continued from the Q${q} checklist`)
    let y = 1236
    const room = (need: number) => { if (y - need < 70) { page = extraPage(`Continued from the Q${q} checklist`); y = 1236 } }
    if (techOverflow.length) {
      put(page, 'Service Technician Comments, continued', 33.5, y, { size: 11, f: bold }); y -= 8
      page.drawLine({ start: { x: 31.8, y }, end: { x: 1003.5, y }, thickness: 0.8, color: INK }); y -= 14
      put(page, 'PM ID:', 36, y, { size: 9.5, f: bold }); put(page, 'Notes:', 274, y, { size: 9.5, f: bold }); y -= 15
      for (const l of techOverflow) {
        room(14)
        put(page, l.id, 36, y, { size: 9, width: 226 }); put(page, l.text, 274, y, { size: 9, width: 725 })
        page.drawLine({ start: { x: 31.8, y: y - 4 }, end: { x: 1003.5, y: y - 4 }, thickness: 0.4, color: INK })
        y -= 14
      }
      y -= 14
    }
    for (const block of overflow) {
      room(48)
      put(page, block.title, 33.5, y, { size: 11, f: bold }); y -= 8
      page.drawLine({ start: { x: 31.8, y }, end: { x: 1003.5, y }, thickness: 0.8, color: INK }); y -= 15
      for (const line of block.lines.flatMap((l) => wrapText(l, font, 9, 960))) { room(14); put(page, line, 36, y, { size: 9 }); y -= 13.5 }
      y -= 14
    }
  }

  /* ── Photos ── */
  if (d.photos.length || d.photosLeftOut) {
    const images: { img: PDFImage; caption: string }[] = []
    for (const p of d.photos) {
      try { images.push({ img: p.mime === 'image/png' ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes), caption: p.caption }) } catch { /* a damaged file is skipped, the report still builds */ }
    }
    const COLS = 2, ROWS = 3, GAP = 22, LEFT = 40, TOP = 1236
    const cellW = (PAGE_W - LEFT * 2 - GAP) / COLS
    const cellH = 372
    let page: PDFPage | null = null
    images.forEach((it, n) => {
      const slot = n % (COLS * ROWS)
      if (slot === 0) page = extraPage(`Inspection photos, Q${q} PM`)
      const x = LEFT + (slot % COLS) * (cellW + GAP)
      const top = TOP - Math.floor(slot / COLS) * cellH
      const scale = Math.min(cellW / it.img.width, (cellH - 54) / it.img.height)
      const w = it.img.width * scale, h = it.img.height * scale
      page!.drawImage(it.img, { x: x + (cellW - w) / 2, y: top - h, width: w, height: h })
      wrapText(it.caption, italic, 9.5, cellW).slice(0, 2).forEach((line, i) => put(page!, line, x, top - (cellH - 54) - 14 - i * 12, { size: 9.5, f: italic }))
    })
    if (d.photosLeftOut) {
      const last = page ?? extraPage(`Inspection photos, Q${q} PM`)
      put(last, `${d.photosLeftOut} more ${d.photosLeftOut === 1 ? 'photo is' : 'photos are'} attached to this PM in PhaseForge and not printed here.`, 33.5, 58, { size: 9.5, f: italic })
    }
  }

  return doc.save()
}
