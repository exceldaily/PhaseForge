import { writeFileSync } from 'fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { computeProgress } from './progress'
import { buildPmReport, pdfSafe, wrapText, type ReportData } from './report'
import { ALDI_Q2_ITEMS, ALDI_Q2_TABLES, buildLayout, seedItemRows } from './template'
import type { PmCycle, PmReading, PmResponse, PmStore, TemplateItem } from './types'

const items: TemplateItem[] = seedItemRows(ALDI_Q2_ITEMS).map((r) => ({
  id: r.code, sectionKey: r.section_key, sectionLabel: r.section_label, sortOrder: r.sort_order, code: r.code, applicability: r.applicability,
  description: r.description, requiresPhoto: r.requires_photo, requiresNote: r.requires_note, measureLabel: r.measure_label, measureUnit: r.measure_unit,
  requiresMeasure: r.requires_measure, readingRefs: r.reading_refs, fopmOnFail: r.fopm_on_fail, hint: r.hint,
}))

/** The completed Q2 sheet for store 474-026, as it was filled in. */
function sample(): ReportData {
  const store = { id: 's', storeNumber: '474-026', address: '5296 W. Irlo Bronson Hwy', city: 'Kissimmee', county: null, state: 'FL', postalCode: null, region: 'Kalos',
    facilityManager: 'Angie Ryder', fmPhone: null, fmEmail: null, storePhone: null, contactNotes: null, primaryTechId: null, secondaryTechId: null,
    systemType: 'HFC', refrigerant: null, notes: null, isActive: true } as PmStore
  const layout = buildLayout(ALDI_Q2_TABLES, [])
  const cycle = { id: 'c', storeId: 's', year: 2026, quarter: 2, jobNumber: null, scWorkOrder: null, jobReceivedDate: null, priority: null, dueDate: null,
    techId: null, helperTechId: null, scheduledDate: '2026-04-13', actualStart: '2026-04-13', actualEnd: '2026-04-16', status: 'field_complete', statusNote: null,
    returnVisitNeeded: false, returnVisitNote: null, techNotes: 'Compressor 4 is shorted to ground and is pending replacement. A8 holdback valve needs rebuilt and has an active small refrigerant leak.',
    coordinatorNotes: null, serviceProvider: 'Kalos Services', timeIn: null, timeOut: null, fmSpotChecked: null, templateVersionId: 't', layout, lastItemId: null,
    checklistTotal: 0, checklistDone: 0, docsTotal: 0, docsDone: 0, openDeficiencies: 0, blockingDeficiencies: 0, waitingFilters: false, waitingParts: false,
    fieldCompletedAt: null, submittedOn: null, closedAt: null, completionOverrideReason: null, updatedAt: '2026-04-16T00:00:00Z' } as PmCycle
  const responses: PmResponse[] = items.filter((i) => i.code !== 'WICF6').map((i) => ({
    itemId: i.id, result: i.code === 'COMP27' ? 'fail' : i.code === 'COND14' ? null : 'pass', measureValue: i.code === 'COMP5' ? '25' : null,
    note: i.code === 'COMP27' ? 'A8 holdback leaking actively' : null, naReason: null, inspectedBy: 'u1', inspectedAt: '2026-04-13T15:00:00Z', rev: 1,
  }))
  const r = (tableKey: string, rowKey: string, colKey: string, value: string): PmReading => ({ tableKey, rowKey, colKey, value })
  const comps = layout.compressors
  const readings: PmReading[] = [
    r('system_superheat', 'lt', 'reading', '39'), r('system_superheat', 'mt', 'reading', '47'),
    ...[['7', ''], ['5', ''], ['', ''], ['14', ''], ['9', ''], ['', ''], ['12', '140'], ['9', '173'], ['12', '178'], ['15', '202'], ['11', '166'], ['8', '152'], ['7', '162'], ['9', '151'], ['11', ''], ['15', '181'], ['13', '188'], ['15', '206']]
      .flatMap(([sh, cfm], i) => [sh ? r('component', layout.circuits[i].key, 'superheat', sh) : null, cfm ? r('component', layout.circuits[i].key, 'cfm', cfm) : null]).filter(Boolean) as PmReading[],
    ...['1/2', '3/4', 'Full', '', 'Full', 'Full'].flatMap((v, i) => (v ? [r('oil_discharge', comps[i].key, 'oil_compressor', v)] : [])),
    ...['272', '271', '268', 'na', '211', '209'].map((v, i) => r('oil_discharge', comps[i].key, 'discharge_temp', v)),
    ...['21.8', '21.5', '21', '21.5', '31.9', '57.4'].map((v, i) => r('electrical', comps[i].key, 'fla', v)),
    ...['14.03 / 7.4 [UNLD]', '12.42', '13.6', 'SHORT TO GROUND', '37.43', '36.85'].map((v, i) => r('electrical', comps[i].key, 'l1_a', v)),
    r('hvac_voltage', 'actual', 'l1l2', '208'), r('hvac_voltage', 'actual', 'l1l3', '209'), r('hvac_voltage', 'actual', 'l2l3', '207'),
    r('hvac_sensors', 'space', 'controller', '73'), r('hvac_sensors', 'space', 'actual', '71'), r('hvac_sensors', 'co2', 'controller', '789'),
    r('hvac_comments', 'additional', 'text', 'Compressor 1 on CES unit is shorted to ground. Filled out compressor form.'),
  ]
  const progress = computeProgress({ items, system: 'HFC', exclusions: [], responses, photoCounts: { COND11: 1 }, readings, deficiencyItemIds: ['COMP27'] })
  return {
    company: 'Kalos Services', store, cycle, items, responses, readings, progress, techName: 'Alex', names: { u1: 'Alex' },
    template: { id: 't', name: 'ALDI HVACR Preventative Maintenance Checklist', quarter: 2, version: 1, revisionLabel: 'Rev: 01_01_25', status: 'active', notes: null, dataTables: ALDI_Q2_TABLES, publishedAt: null, createdAt: '' },
    deficiencies: [{ id: 'd', storeId: 's', pmId: 'c', itemId: 'COMP27', itemCode: 'COMP27', equipmentId: null, equipmentLabel: 'A-8 Produce', description: 'A8 holdback valve needs rebuilt and has an active small refrigerant leak',
      severity: 'high', recommendedRepair: 'Rebuild the holdback valve and leak check', proposalRequired: true, proposalSubmittedDate: null, proposalStatus: 'needed', returnVisitRequired: true, affectsPm: false,
      followupJobNumber: null, repairStatus: 'open', resolvedOn: null, resolutionNote: null, createdBy: 'u1', createdAt: '2026-04-13T15:00:00Z' }],
    materials: [{ id: 'm', pmId: 'c', storeId: 's', category: 'filter', name: 'Merv 8 pleated filter 20x25x2', partNumber: null, quantity: 12, unitLabel: 'RTU 1 and 2', equipmentId: null, itemId: null,
      requestedBy: 'u1', requestedDate: '2026-04-13', status: 'installed', orderedDate: '2026-04-13', vendor: null, poNumber: null, etaDate: null, receivedDate: '2026-04-15', installedDate: '2026-04-16', notes: null, updatedAt: '' }],
    photos: [], photosLeftOut: 0, version: 1, generatedBy: 'Brad Harvey', generatedAt: '2026-04-16T18:00:00Z',
  }
}

describe('the PM report', () => {
  it('keeps text printable whatever was typed', () => {
    expect(pdfSafe('delta P≥10 psi')).toBe('delta P>=10 psi')
    expect(pdfSafe('“Smart” ‘quotes’ – and …')).toBe('"Smart" \'quotes\' - and ...')
    expect(pdfSafe('2°F ✔ \u{1F600} ok')).toBe('2°F x  ok')
    expect(pdfSafe(null)).toBe('')
  })
  it('wraps long text and cuts words that cannot fit', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const lines = wrapText('Check and record refrigerant level within the receiver while the unit is running at full load', font, 9, 120)
    expect(lines.length).toBeGreaterThanOrEqual(3)
    for (const l of lines) expect(font.widthOfTextAtSize(l, 9)).toBeLessThanOrEqual(120)
    expect(wrapText('A'.repeat(80), font, 9, 60).every((l) => font.widthOfTextAtSize(l, 9) <= 60)).toBe(true)
    expect(wrapText('', font, 9, 100)).toEqual([''])
  })
  it('builds a multi-page PDF with every part of the sheet', async () => {
    const bytes = await buildPmReport(sample())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(5)
    expect(doc.getTitle()).toBe('PM Report 474-026 Q2 2026')
    if (process.env.PM_REPORT_OUT) writeFileSync(process.env.PM_REPORT_OUT, bytes)
  })
  it('still builds with nothing filled in, and with a photo', async () => {
    const empty = sample()
    empty.responses = []; empty.readings = []; empty.deficiencies = []; empty.materials = []
    empty.progress = computeProgress({ items, system: null, exclusions: [], responses: [], photoCounts: {}, readings: [], deficiencyItemIds: [] })
    // A 1x1 PNG.
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
    empty.photos = [{ bytes: png, mime: 'image/png', caption: 'COND11' }, { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg', caption: 'broken file' }]
    empty.photosLeftOut = 2
    const doc = await PDFDocument.load(await buildPmReport(empty))
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4)
  })
})
