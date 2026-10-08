import { describe, expect, it } from 'vitest'
import {
  averagePct, blockersOf, bucketOf, completionGaps, computeProgress, fieldCompleteGaps, isOverdue, itemApplies, pct, resumeItemId,
  type ProgressInput,
} from './progress'
import { ALDI_Q2_ITEMS, ALDI_Q2_TABLES, DEFAULT_CIRCUITS, buildLayout, isNotesTable, rowsFor, seedItemRows } from './template'
import { addBusinessDays, parseLooseDate, parseQuarter, quarterMonths, quarterOf, quarterRange } from './quarters'
import { DEFAULT_RULES, mergeRules, type TemplateItem } from './types'

/** The real Q2 checklist as template items, ids = PM IDs. */
const ITEMS: TemplateItem[] = seedItemRows(ALDI_Q2_ITEMS).map((r) => ({
  id: r.code, sectionKey: r.section_key, sectionLabel: r.section_label, sortOrder: r.sort_order, code: r.code,
  applicability: r.applicability, description: r.description, requiresPhoto: r.requires_photo, requiresNote: r.requires_note,
  measureLabel: r.measure_label, measureUnit: r.measure_unit, requiresMeasure: r.requires_measure,
  readingRefs: r.reading_refs, fopmOnFail: r.fopm_on_fail, hint: r.hint,
}))
const base = (over: Partial<ProgressInput> = {}): ProgressInput => ({
  items: ITEMS, system: 'HFC', exclusions: [], responses: [], photoCounts: {}, readings: [], deficiencyItemIds: [], ...over,
})
const pass = (...codes: string[]) => codes.map((c) => ({ itemId: c, result: 'pass' as const, measureValue: null, note: null }))
const FLAGS = { waitingFilters: false, waitingParts: false, returnVisitNeeded: false, blockingDeficiencies: 0 }

describe('the ALDI Q2 checklist as transcribed', () => {
  it('has every PM ID on the sheet, once', () => {
    expect(ALDI_Q2_ITEMS).toHaveLength(70)
    expect(new Set(ALDI_Q2_ITEMS.map((i) => i.code)).size).toBe(70)
    const count = (p: string) => ALDI_Q2_ITEMS.filter((i) => i.code.startsWith(p)).length
    expect([count('COND'), count('COMP'), count('MDU'), count('WICF'), count('RGEN'), count('SM'), count('EVAC'), count('HVAC')])
      .toEqual([10, 18, 8, 11, 3, 2, 1, 17])
  })
  it('keeps the gaps in the numbering instead of inventing checks', () => {
    const codes = new Set(ALDI_Q2_ITEMS.map((i) => i.code))
    for (const missing of ['COND6', 'COND10', 'COMP8', 'MDU4', 'SM2', 'HVAC17']) expect(codes.has(missing)).toBe(false)
  })
  it('keeps the refrigerant labels', () => {
    const label = (c: string) => ALDI_Q2_ITEMS.find((i) => i.code === c)!.applicability
    expect(label('COND9')).toBe('HFC')
    expect(label('COND14')).toBe('R-290')
    expect(label('COMP2')).toBe('HFC/CO2')
    expect(label('COMP24')).toBe('HFC')
    expect(label('RGEN2')).toBe('CO2')
    expect(label('COND1')).toBe('ALL')
    expect(label('HVAC4')).toBe('')
  })
  it('keeps the mandatory photos, readings, and FOPM proposals', () => {
    const where = (f: (i: (typeof ALDI_Q2_ITEMS)[number]) => unknown) => ALDI_Q2_ITEMS.filter(f).map((i) => i.code)
    expect(where((i) => i.photo)).toEqual(['COND11', 'COMP9', 'COMP18', 'COMP24', 'MDU1', 'WICF10'])
    expect(where((i) => i.readings?.length)).toEqual(['COMP7', 'COMP9', 'COMP22', 'COMP23', 'MDU2', 'MDU9', 'WICF5'])
    expect(where((i) => i.measure?.required)).toEqual(['COMP5', 'RGEN2'])
    expect(where((i) => i.fopm)).toEqual(['COND14', 'COMP6', 'COMP10', 'COMP23', 'COMP27', 'MDU1', 'MDU5', 'MDU7', 'WICF7', 'WICF10', 'RGEN1', 'RGEN2', 'RGEN3'])
  })
  it('has the data entry tables with the rows printed on the sheet', () => {
    expect(DEFAULT_CIRCUITS.map((r) => r.label).filter((l, i, a) => a.indexOf(l) === i)).toEqual(['A-1 Freezer', 'A-4 Cooler', 'A-5 Deli', 'A-6 Meat', 'A-7 Meat Cooler', 'A-8 Produce'])
    expect(DEFAULT_CIRCUITS).toHaveLength(19)
    const t = (k: string) => ALDI_Q2_TABLES.find((x) => x.key === k)!
    expect(t('electrical').columns).toHaveLength(16)
    expect(t('electrical').rows).toHaveLength(6)
    expect(t('hvac_amps').rows).toHaveLength(4)
    expect(t('hvac_sensors').rows.map((r) => r.label)).toEqual(['Space Temp', 'WB / DewPt.', 'OAT', 'RAT', 'CO2'])
    expect(isNotesTable(t('hvac_comments'))).toBe(true)
    expect(isNotesTable(t('component'))).toBe(false)
    // Every reading a check points at exists.
    for (const item of ALDI_Q2_ITEMS) for (const ref of item.readings ?? []) {
      const table = ALDI_Q2_TABLES.find((x) => x.key === ref.table)
      expect(table, `${item.code} -> ${ref.table}`).toBeTruthy()
      if (ref.column) expect(table!.columns.some((c) => c.key === ref.column), `${item.code} -> ${ref.column}`).toBe(true)
    }
  })
})

describe('applicability', () => {
  it('follows the label on the sheet', () => {
    expect(itemApplies('ALL', 'CO2')).toBe(true)
    expect(itemApplies('', 'R-290')).toBe(true)
    expect(itemApplies('HFC', 'HFC')).toBe(true)
    expect(itemApplies('HFC', 'CO2')).toBe(false)
    expect(itemApplies('HFC/CO2', 'CO2')).toBe(true)
    expect(itemApplies('HFC/CO2', 'R-290')).toBe(false)
    expect(itemApplies('R-290', 'R-290')).toBe(true)
    expect(itemApplies('CO2', 'HFC')).toBe(false)
  })
  it('hides nothing while the store system is unknown', () => {
    expect(itemApplies('R-290', null)).toBe(true)
    expect(computeProgress(base({ system: null })).checklistTotal).toBe(70)
  })
  it('sizes the checklist to the store', () => {
    // HFC: everything except R-290 only (COND14) and CO2 only (RGEN2).
    expect(computeProgress(base({ system: 'HFC' })).checklistTotal).toBe(68)
    // CO2: drops COND9, COND14, COMP24.
    expect(computeProgress(base({ system: 'CO2' })).checklistTotal).toBe(67)
    // Propane: drops the 12 HFC/CO2 compressor checks, COND9, COMP24, RGEN2.
    expect(computeProgress(base({ system: 'R-290' })).checklistTotal).toBe(55)
  })
})

describe('progress', () => {
  it('starts at zero and never rounds up to done', () => {
    expect(computeProgress(base()).checklistPct).toBe(0)
    expect(pct(67, 68)).toBe(98)
    expect(pct(0, 0)).toBe(0)
    expect(pct(68, 68)).toBe(100)
  })
  it('counts pass and fail the same', () => {
    const p = computeProgress(base({ responses: [...pass('COND1', 'COND2'), { itemId: 'COND3', result: 'fail', measureValue: null, note: null }] }))
    expect(p.checklistDone).toBe(3)
    expect(p.fails).toBe(1)
    expect(p.failsUnlinked).toBe(1)
  })
  it('takes Not Applicable out of both sides', () => {
    const p = computeProgress(base({ responses: [...pass('COND1'), { itemId: 'COND4', result: 'na', measureValue: null, note: null }, { itemId: 'COND5', result: 'na', measureValue: null, note: null }] }))
    expect(p.checklistTotal).toBe(66)
    expect(p.checklistDone).toBe(1)
    expect(p.byId.COND4.state).toBe('na')
  })
  it('takes store exclusions out too, whatever was answered', () => {
    const p = computeProgress(base({ exclusions: [{ itemCode: 'cond7', reason: 'No grease fittings on this unit' }], responses: pass('COND7') }))
    expect(p.checklistTotal).toBe(67)
    expect(p.byId.COND7).toMatchObject({ state: 'excluded', counted: false, excludedWhy: 'No grease fittings on this unit' })
  })
  it('does not count a check until what it calls for is in', () => {
    const answered = pass('COND11', 'COMP5', 'COMP22', 'COMP9')
    const p = computeProgress(base({ responses: answered }))
    expect(p.checklistDone).toBe(0)
    expect(p.byId.COND11).toMatchObject({ state: 'incomplete', missing: ['photo'] })
    expect(p.byId.COMP5.missing).toEqual(['measure'])
    expect(p.byId.COMP22.missing).toEqual(['reading'])
    expect(p.byId.COMP9.missing).toEqual(['photo', 'reading'])

    const q = computeProgress(base({
      responses: [...pass('COND11', 'COMP22', 'COMP9'), { itemId: 'COMP5', result: 'pass', measureValue: '25', note: null }],
      photoCounts: { COND11: 1, COMP9: 3 },
      readings: [{ tableKey: 'system_superheat', colKey: 'reading', value: '39' }, { tableKey: 'oil_discharge', colKey: 'oil_compressor', value: '1/2' }],
    }))
    expect(q.checklistDone).toBe(4)
  })
  it('needs the right column, not just any reading in the table', () => {
    const p = computeProgress(base({ responses: pass('COMP23', 'MDU2', 'MDU9'), readings: [{ tableKey: 'oil_discharge', colKey: 'oil_compressor', value: 'Full' }, { tableKey: 'component', colKey: 'superheat', value: '7' }] }))
    expect(p.byId.COMP23.state).toBe('incomplete')
    expect(p.byId.MDU2.state).toBe('incomplete')
    expect(p.byId.MDU9.state).toBe('pass')
  })
  it('accepts text readings like the field writes them', () => {
    const p = computeProgress(base({ responses: pass('COMP7'), readings: [{ tableKey: 'electrical', colKey: 'l1_a', value: 'SHORT TO GROUND' }] }))
    expect(p.byId.COMP7.state).toBe('pass')
    expect(computeProgress(base({ responses: pass('COMP7'), readings: [{ tableKey: 'electrical', colKey: 'l1_a', value: '   ' }] })).byId.COMP7.state).toBe('incomplete')
  })
  it('tracks documentation apart from the checklist', () => {
    const empty = computeProgress(base())
    // HFC store: 6 photos + 7 reading checks + COMP5 value. RGEN2 does not apply.
    expect(empty.docsTotal).toBe(14)
    expect(empty.docsDone).toBe(0)
    const some = computeProgress(base({ photoCounts: { COND11: 2, MDU1: 1 }, readings: [{ tableKey: 'electrical', colKey: 'fla', value: '21.8' }] }))
    expect(some.docsDone).toBe(3)
    expect(some.checklistDone).toBe(0)
    expect(some.docsPct).toBe(21)
  })
  it('makes a failed check ask for a deficiency, without blocking the inspection count', () => {
    const fail = [{ itemId: 'COMP27', result: 'fail' as const, measureValue: null, note: 'Leak at A8 holdback' }]
    const open = computeProgress(base({ responses: fail }))
    expect(open.byId.COMP27).toMatchObject({ state: 'fail', done: true, needsDeficiency: true })
    expect(open.docsTotal).toBe(15)
    const linked = computeProgress(base({ responses: fail, deficiencyItemIds: ['COMP27'] }))
    expect(linked.failsUnlinked).toBe(0)
    expect(linked.docsDone).toBe(1)
  })
  it('follows the rules that are switched on', () => {
    const rules = mergeRules({ photos: false, readings: false, notes: false })
    const p = computeProgress(base({ responses: pass('COND11', 'COMP5', 'COMP22'), rules }))
    expect(p.checklistDone).toBe(3)
    expect(p.docsTotal).toBe(0)
    expect(p.docsPct).toBe(100)
    expect(computeProgress(base({ rules: mergeRules({ techNotes: true }), techNotes: 'All good' })).docsDone).toBe(1)
  })
  it('breaks progress down by section', () => {
    const p = computeProgress(base({ responses: pass('COND1', 'COND2', 'COND3', 'COND4', 'COND5', 'COND7', 'COND8', 'COND9') }))
    const cond = p.sections.find((s) => s.key === 'cond')!
    expect(cond).toMatchObject({ label: 'Condenser Service', total: 9, done: 8, todo: 1, pct: 88 })
    expect(p.sections.map((s) => s.key)).toEqual(['cond', 'comp', 'mdu', 'wicf', 'rgen', 'sm', 'evac', 'hvac'])
  })
  it('reaches 100 only when every applicable check is fully in', () => {
    const all = computeProgress(base({ system: 'HFC' }))
    const answers = all.evals.filter((e) => e.counted).map((e) => ({ itemId: e.item.id, result: 'pass' as const, measureValue: e.item.requiresMeasure ? '25' : null, note: null }))
    const photoCounts = Object.fromEntries(ITEMS.filter((i) => i.requiresPhoto).map((i) => [i.id, 1]))
    const readings = [
      { tableKey: 'electrical', colKey: 'fla', value: '21.8' }, { tableKey: 'oil_discharge', colKey: 'oil_compressor', value: 'Full' },
      { tableKey: 'oil_discharge', colKey: 'discharge_temp', value: '211' }, { tableKey: 'system_superheat', colKey: 'reading', value: '39' },
      { tableKey: 'component', colKey: 'superheat', value: '7' }, { tableKey: 'component', colKey: 'cfm', value: '140' },
    ]
    const full = computeProgress(base({ responses: answers, photoCounts, readings }))
    expect(full).toMatchObject({ checklistPct: 100, checklistDone: 68, docsPct: 100, uninspected: 0, incomplete: 0 })
    expect(computeProgress(base({ responses: answers.slice(1), photoCounts, readings })).checklistPct).toBe(98)
  })
})

describe('resume', () => {
  it('lands on the next open check after the last one touched, then wraps', () => {
    const p = computeProgress(base({ responses: pass('COND1', 'COND2', 'COND4') }))
    expect(resumeItemId(p, 'COND2')).toBe('COND3')
    expect(resumeItemId(p, 'COND4')).toBe('COND5')
    expect(resumeItemId(p, null)).toBe('COND3')
    expect(resumeItemId(p, 'HVAC26')).toBe('COND3')
  })
  it('skips checks that do not apply', () => {
    const p = computeProgress(base({ system: 'CO2', responses: pass('COND8') }))
    expect(resumeItemId(p, 'COND8')).toBe('COND11')
  })
})

describe('gates', () => {
  const done = () => {
    const all = computeProgress(base())
    return computeProgress(base({
      responses: all.evals.filter((e) => e.counted).map((e) => ({ itemId: e.item.id, result: 'pass' as const, measureValue: '25', note: null })),
      photoCounts: Object.fromEntries(ITEMS.map((i) => [i.id, 1])),
      readings: ALDI_Q2_TABLES.flatMap((t) => t.columns.map((c) => ({ tableKey: t.key, colKey: c.key, value: '1' }))),
    }))
  }
  it('lists what is left before field work can be called complete', () => {
    const p = computeProgress(base({ responses: pass('COND11') }))
    const gaps = fieldCompleteGaps(p, { ...FLAGS, waitingFilters: true, returnVisitNeeded: true })
    expect(gaps).toEqual(['67 checks not inspected yet', '6 checks still need a photo', '7 checks still need readings', '1 check still needs a recorded value or note', 'A return visit is flagged', 'Filters are still outstanding'])
    expect(fieldCompleteGaps(done(), FLAGS)).toEqual([])
  })
  it('does not complete a PM just because every box is ticked', () => {
    const facts = { ...FLAGS, techNotes: null, submittedOn: null, status: 'field_complete' as const, reportCount: 0 }
    expect(completionGaps(done(), facts)).toEqual(['The date the documentation was submitted is not recorded'])
    expect(completionGaps(done(), { ...facts, submittedOn: '2026-04-16' })).toEqual([])
    expect(completionGaps(done(), facts, mergeRules({ techNotes: true, reportGenerated: true }))).toEqual([
      'Technician notes are empty', 'The date the documentation was submitted is not recorded', 'No PM report has been generated',
    ])
  })
  it('lets a PM close with an open repair, but not with an unwritten failure', () => {
    const all = computeProgress(base())
    const answers = all.evals.filter((e) => e.counted).map((e) => ({ itemId: e.item.id, result: (e.item.code === 'COMP27' ? 'fail' : 'pass') as 'pass' | 'fail', measureValue: '25', note: null }))
    const rest = { photoCounts: Object.fromEntries(ITEMS.map((i) => [i.id, 1])), readings: ALDI_Q2_TABLES.flatMap((t) => t.columns.map((c) => ({ tableKey: t.key, colKey: c.key, value: '1' }))) }
    const facts = { ...FLAGS, techNotes: null, submittedOn: '2026-04-16', status: 'submitted' as const, reportCount: 1 }
    expect(completionGaps(computeProgress(base({ responses: answers, ...rest })), facts)).toEqual(['1 failed check with no deficiency written up'])
    // Written up: the repair can stay open, the PM can close.
    expect(completionGaps(computeProgress(base({ responses: answers, ...rest, deficiencyItemIds: ['COMP27'] })), facts)).toEqual([])
    // Unless that deficiency was marked as holding up the PM itself.
    expect(completionGaps(computeProgress(base({ responses: answers, ...rest, deficiencyItemIds: ['COMP27'] })), { ...facts, blockingDeficiencies: 1 }))
      .toEqual(['1 deficiency marked as holding up the PM'])
  })
  it('names the blockers beside the status', () => {
    expect(blockersOf(FLAGS)).toEqual([])
    expect(blockersOf({ waitingFilters: true, waitingParts: true, returnVisitNeeded: true, blockingDeficiencies: 2 }))
      .toEqual(['waiting_filters', 'waiting_parts', 'return_visit', 'blocking_deficiency'])
  })
})

describe('dashboard helpers', () => {
  it('buckets completion', () => {
    expect([0, 1, 25, 26, 50, 51, 75, 76, 99, 100].map(bucketOf)).toEqual(['0', '1-25', '1-25', '26-50', '26-50', '51-75', '51-75', '76-99', '76-99', '100'])
  })
  it('flags overdue only while a PM is open', () => {
    expect(isOverdue({ dueDate: '2026-10-01', status: 'in_progress' }, '2026-10-08')).toBe(true)
    expect(isOverdue({ dueDate: '2026-10-08', status: 'in_progress' }, '2026-10-08')).toBe(false)
    expect(isOverdue({ dueDate: '2026-10-01', status: 'completed' }, '2026-10-08')).toBe(false)
    expect(isOverdue({ dueDate: null, status: 'scheduled' }, '2026-10-08')).toBe(false)
  })
  it('averages only PMs with a checklist started', () => {
    expect(averagePct([
      { checklistDone: 34, checklistTotal: 68, status: 'in_progress' }, { checklistDone: 68, checklistTotal: 68, status: 'completed' },
      { checklistDone: 0, checklistTotal: 0, status: 'awaiting_job_number' }, { checklistDone: 10, checklistTotal: 68, status: 'cancelled' },
    ])).toBe(75)
    expect(averagePct([])).toBe(0)
  })
})

describe('layout', () => {
  it('uses the sheet rows until the store lists its own equipment', () => {
    const none = buildLayout(ALDI_Q2_TABLES, [])
    expect(none.circuits).toHaveLength(19)
    expect(none.compressors.map((r) => r.label)).toEqual(['Compressor 1', 'Compressor 2', 'Compressor 3', 'Compressor 4', 'Compressor 5', 'Compressor 6'])
    const own = buildLayout(ALDI_Q2_TABLES, [
      { id: 'b', kind: 'compressor', label: 'MT Comp 2', sortOrder: 2, isActive: true },
      { id: 'a', kind: 'compressor', label: 'MT Comp 1', sortOrder: 1, isActive: true },
      { id: 'c', kind: 'compressor', label: 'Old comp', sortOrder: 3, isActive: false },
    ])
    expect(own.compressors).toEqual([{ key: 'eq:a', label: 'MT Comp 1' }, { key: 'eq:b', label: 'MT Comp 2' }])
    expect(own.circuits).toHaveLength(19)
    const electrical = ALDI_Q2_TABLES.find((t) => t.key === 'electrical')!
    expect(rowsFor(electrical, own)).toHaveLength(2)
    expect(rowsFor(electrical, null)).toHaveLength(6)
    expect(rowsFor(ALDI_Q2_TABLES.find((t) => t.key === 'system_superheat')!, own).map((r) => r.key)).toEqual(['lt', 'mt'])
  })
})

describe('quarters', () => {
  it('maps dates to calendar quarters', () => {
    expect(quarterOf('2026-01-01')).toEqual({ year: 2026, quarter: 1 })
    expect(quarterOf('2026-03-31')).toEqual({ year: 2026, quarter: 1 })
    expect(quarterOf('2026-04-13')).toEqual({ year: 2026, quarter: 2 })
    expect(quarterOf('2026-09-30')).toEqual({ year: 2026, quarter: 3 })
    expect(quarterOf('2026-10-08')).toEqual({ year: 2026, quarter: 4 })
    expect(quarterRange(2026, 2)).toEqual({ start: '2026-04-01', end: '2026-06-30' })
    expect(quarterRange(2028, 1)).toEqual({ start: '2028-01-01', end: '2028-03-31' })
    expect(quarterMonths(4)).toBe('October to December')
  })
  it('reads quarters the way people type them', () => {
    expect(parseQuarter('Q2 2026')).toEqual({ year: 2026, quarter: 2 })
    expect(parseQuarter('2026-Q3')).toEqual({ year: 2026, quarter: 3 })
    expect(parseQuarter('q4', 2026)).toEqual({ year: 2026, quarter: 4 })
    expect(parseQuarter('3', 2027)).toEqual({ year: 2027, quarter: 3 })
    expect(parseQuarter('Q5 2026')).toBeNull()
    expect(parseQuarter('Q2')).toBeNull()
  })
  it('counts business days and reads loose dates', () => {
    expect(addBusinessDays('2026-10-08', 2)).toBe('2026-10-12')
    expect(addBusinessDays('2026-10-09', 1)).toBe('2026-10-12')
    expect(parseLooseDate('4/13/2026')).toBe('2026-04-13')
    expect(parseLooseDate('04-16-26')).toBe('2026-04-16')
    expect(parseLooseDate('2026-04-13T00:00:00Z')).toBe('2026-04-13')
    expect(parseLooseDate(46125)).toBe('2026-04-13')
    expect(parseLooseDate('next week')).toBeNull()
    expect(parseLooseDate('13/45/2026')).toBeNull()
  })
  it('keeps the default rules strict', () => {
    expect(DEFAULT_RULES).toMatchObject({ allInspected: true, photos: true, readings: true, failsLinked: true, submitted: true })
    expect(mergeRules({ photos: false, bogus: true } as never)).toMatchObject({ photos: false, readings: true })
  })
})
