// The ALDI HVACR Preventative Maintenance Checklist, Quarter 2, Rev 01_01_25,
// transcribed from the completed sheet for store 474-026. PM IDs, wording,
// grouping, and refrigerant labels are kept as printed. Gaps in the numbering
// (no COND6, no COMP8) are how the Q2 sheet reads: those IDs belong to other
// quarters, which is why Q1, Q3, and Q4 get their own versions.

import type { DataRow, DataTable, PmEquipment, PmLayout, ReadingRef } from './types'

export interface SeedItem {
  section: string
  code: string
  applicability: string
  description: string
  photo?: boolean
  note?: boolean
  measure?: { label: string; unit: string; required?: boolean }
  readings?: ReadingRef[]
  fopm?: boolean
  hint?: string
}

export const SECTIONS: { key: string; label: string; group: string }[] = [
  { key: 'cond', label: 'Condenser Service', group: 'Refrigeration units' },
  { key: 'comp', label: 'Compressor Cabinet Service', group: 'Refrigeration units' },
  { key: 'mdu', label: 'Multi-Deck Cases', group: 'Cases, walk-ins, and spot merchandisers' },
  { key: 'wicf', label: 'Walk-In Coolers and Freezers', group: 'Cases, walk-ins, and spot merchandisers' },
  { key: 'rgen', label: 'General Refrigeration Inspections', group: 'Cases, walk-ins, and spot merchandisers' },
  { key: 'sm', label: 'Spot Merchandisers', group: 'Cases, walk-ins, and spot merchandisers' },
  { key: 'evac', label: 'EVAC', group: 'EVAC' },
  { key: 'hvac', label: 'HVAC Inspections', group: 'HVAC units' },
]
export const sectionLabel = (key: string) => SECTIONS.find((s) => s.key === key)?.label ?? key

const A = 'ALL'
const HC = 'HFC/CO2'
const QUESTION = 'A question on the sheet. Pass means no issue was found.'

export const ALDI_Q2_ITEMS: SeedItem[] = [
  // ── Condenser Service ──
  { section: 'cond', code: 'COND1', applicability: A, description: 'Check the unit for physical damage and any unusual noise/vibration.' },
  { section: 'cond', code: 'COND2', applicability: A, description: 'Visually inspect condenser and valves for any oil stains that are indicative of a refrigerant leak (check for signs of Glycol stains for propane stores).' },
  { section: 'cond', code: 'COND3', applicability: A, description: 'Inspect the condenser and ensure the fans (and inverter) are operating properly and spinning in the proper direction.' },
  { section: 'cond', code: 'COND4', applicability: A, description: 'Ensure exhaust fan (if applicable) for VFD control panel is operational.' },
  { section: 'cond', code: 'COND5', applicability: A, description: 'Ensure the VFD is operating properly (if applicable).' },
  { section: 'cond', code: 'COND7', applicability: A, description: 'Lubricate all bearings and drive shafts (if applicable).' },
  { section: 'cond', code: 'COND8', applicability: A, description: 'Ensure the packing nut on all valves (split, ball, solenoid, etc.) are secure and service caps are present (i.e., ball valve cap).' },
  { section: 'cond', code: 'COND9', applicability: 'HFC', description: 'Verify operation of split condenser (if applicable). Temporarily force unit into summer mode ("cooling mode") and ensure sufficient refrigerant levels for operation.' },
  { section: 'cond', code: 'COND11', applicability: A, photo: true, description: 'Inspect condenser coil for cleanliness (photo required). If needed, clean condenser coil using water, a non acidic agent, or compressed air. Note: Additional cleanings may be needed outside of quarterly PM based on environment.' },
  { section: 'cond', code: 'COND14', applicability: 'R-290', fopm: true, description: 'For stores with Glycol Pumps, ensure pumps are operational and securely mounted. Check Glycol pressure to verify no leakage has occurred. Submit FOPM proposal for any repairs needed.' },

  // ── Compressor Cabinet Service ──
  { section: 'comp', code: 'COMP1', applicability: A, description: 'Check the unit for physical damage and any unusual noise/vibration.' },
  { section: 'comp', code: 'COMP2', applicability: HC, description: 'Ensure vibration isolation mounts and clamps on compressors and piping are secured and in good working order.' },
  { section: 'comp', code: 'COMP3', applicability: HC, description: 'Visually inspect within the cabinet for any oil stains that are indicative of a refrigerant leak.' },
  { section: 'comp', code: 'COMP4', applicability: HC, description: 'Visually inspect all hoses, flex tubes, compressor bodies, copper piping and tubes for wear or signs of rub-throughs.' },
  { section: 'comp', code: 'COMP5', applicability: HC, measure: { label: 'Receiver level', unit: '%', required: true }, description: 'Check and record refrigerant level within the receiver while the unit is running at full load (i.e., no circuits in defrost, condenser in summer mode, etc.). Record refrigerant level in Service Technician Comments field located below.' },
  { section: 'comp', code: 'COMP6', applicability: HC, fopm: true, description: 'Receiver level mechanical gauge must match what the Refrigeration Controller reads. Ensure there are no offsets or overrides listed in the controller for this point and ensure no low level alarms have been active within last 14 days. If level sensor is faulty, must submit FOPM proposal for replacement.' },
  { section: 'comp', code: 'COMP7', applicability: HC, readings: [{ table: 'electrical' }], description: "Complete the 'Electrical Readings Chart' at the bottom of this checklist. Check and tighten all electrical connections and check contactors for signs of wear or damage." },
  { section: 'comp', code: 'COMP9', applicability: HC, photo: true, readings: [{ table: 'oil_discharge', column: 'oil_compressor' }], description: 'Record the oil levels in each compressor and in the reservoir in the data table below (Refrigeration Data Entry Table). Ensure oil level at every compressor meets OEM specification. Must provide photos of all oil levels.' },
  { section: 'comp', code: 'COMP10', applicability: HC, fopm: true, measure: { label: 'Oil separator delta P', unit: 'psi' }, description: 'Check operation of oil separator and oil quality. Separator filter must be replaced if delta P≥10 psi. Must submit FOPM proposal for replacement. Once filter is replaced, MUST legibly label filter replacement with date (DD/MM/YY) in permanent marker directly on date-log sticker tracker.' },
  { section: 'comp', code: 'COMP14', applicability: A, description: 'Ensure all valves (solenoid, liquid injection, stops, ball, etc.) are secure and have service caps installed (i.e., ball valve).' },
  { section: 'comp', code: 'COMP17', applicability: A, description: 'Verify all temperature set points per the EMS user guide. Provide detailed explanation on differences.', hint: 'If any set point differs, explain it in the note.' },
  { section: 'comp', code: 'COMP18', applicability: A, photo: true, description: 'Check refrigeration controller for active alarms and notices (photo of alarm panel required, even if no active alarms). For stores with BMCS (i.e., IMS, Niagara, etc.), verify no active alarms in BMCS portal.' },
  { section: 'comp', code: 'COMP22', applicability: HC, readings: [{ table: 'system_superheat' }], description: 'Measure and record circuit level superheat in the System Superheat section of the Refrigeration Data Entry Table below. Take a temperature reading from the main suction header close to the compressors. Suction line temp - saturation temp = superheat. Compare this measurement to the display on the refrigeration controller by converting the suction PSI to saturation temperature using a PTR chart.' },
  { section: 'comp', code: 'COMP23', applicability: HC, fopm: true, readings: [{ table: 'oil_discharge', column: 'discharge_temp' }], description: 'Using a thermocouple, measure and record the discharge temperature for each compressor. Record the temperatures in data table below (Refrigeration Data Entry). Note: measure at 6" from the discharge service valve. For any values that exceed the manufacturer recommended max discharge temp, must submit FOPM proposal for further troubleshooting of the compressor(s).' },
  { section: 'comp', code: 'COMP24', applicability: 'HFC', photo: true, description: "Locations with refrigeration CU's: Observe the liquid level indicator to ensure that the system is fully charged and free of moisture. Must provide photos of Liquid Level Indicator(s)." },
  { section: 'comp', code: 'COMP27', applicability: A, fopm: true, description: 'Leak check entire refrigeration system with Bacharach PGM leak detector (or equivalent) (Condenser, Multi-decks, Compressor Cabinet, Walk-ins). Must submit FOPM proposal to correct any leaks.' },
  { section: 'comp', code: 'COMP29', applicability: HC, description: 'Verify all pressure relief valves are properly seated.' },
  { section: 'comp', code: 'COMP33', applicability: HC, description: 'Calibrate/verify all high & low pressure switches are set to spec per compressor model/refrigerant type.' },

  // ── Multi-Deck Cases ──
  { section: 'mdu', code: 'MDU1', applicability: A, photo: true, fopm: true, description: 'Inspect multi-deck case drain pans for cleanliness (photo required). Submit FOPM proposal to clean units outside of the 1 year cleaning. Note: shelf cleaning should be performed regularly by store personnel.' },
  { section: 'mdu', code: 'MDU2', applicability: A, readings: [{ table: 'component', column: 'cfm' }], description: 'Inspect MDU fans for proper operation. Ensure airflow matches OEM specifications in CFM with anemometer, no vibrations and clean. Record CFM measurement in table below (Refrigeration Data Entry, Fan CFM section).' },
  { section: 'mdu', code: 'MDU3', applicability: A, description: 'Tighten all electrical connections and visually check for any damage or corrosion.' },
  { section: 'mdu', code: 'MDU5', applicability: A, fopm: true, description: 'Ensure that each drain has a strainer installed. If strainers are missing, must submit FOPM proposal.' },
  { section: 'mdu', code: 'MDU6', applicability: A, description: 'Pull bottom panel and check drainage type. For gravity drainage systems/drains that flow straight into the floor, blow compressed air/nitrogen through the line to ensure that there is no obstruction and clean the lip of the flap valve with cloth to ensure that it opens freely. For condensate removal systems, remove and clean buffer boxes. Inspect and test actuators and ensure condensate removal system is functioning optimally.' },
  { section: 'mdu', code: 'MDU7', applicability: A, fopm: true, description: 'Verify all temperature sensors, defrost sensors and product simulation sensors are accurate within 2°F. Verify all transducers are accurate within 5%. If any sensor is out of tolerance, must submit FOPM proposal for replacement.' },
  { section: 'mdu', code: 'MDU8', applicability: A, description: 'Pull and clean out honeycombs. Ensure lights and night curtains are clean and operational.' },
  { section: 'mdu', code: 'MDU9', applicability: A, readings: [{ table: 'component', column: 'superheat' }], description: 'Verify proper superheat per coil. Record the settings per coil per MDU and record in the data table below (Refrigeration Data Entry, Component Superheat section).' },

  // ── Walk-In Coolers and Freezers ──
  { section: 'wicf', code: 'WICF1', applicability: A, description: 'Check and clean any dust/debris at walk-in cooler/freezer/meat evaporator coils, fans, and guards.' },
  { section: 'wicf', code: 'WICF2', applicability: A, description: 'Flush evaporator drains of cooler/freezer/meat cooler.' },
  { section: 'wicf', code: 'WICF3', applicability: A, description: 'Spray mold inhibitor on walk-in cooler evaporator coils and fan guards.' },
  { section: 'wicf', code: 'WICF4', applicability: A, description: 'Check amp draw and voltage for defrost heaters and ensure heaters are positioned for maximum heat transfer to the coil.' },
  { section: 'wicf', code: 'WICF5', applicability: A, readings: [{ table: 'component', column: 'superheat' }], description: 'Verify proper superheat per coil and ensure proper operation of TXV/EEV. Record the settings in the data section below (Refrigeration Data Entry, Component Superheat section).' },
  { section: 'wicf', code: 'WICF6', applicability: A, description: 'On defrost, ensure the liquid line solenoid valve closes.' },
  { section: 'wicf', code: 'WICF7', applicability: A, fopm: true, description: 'Check glass doors for ice buildup, cracks, condensation. Check frame heater wattage. Check for frame warpage. Ensure that humidity sensor(s) for the anti-sweat heaters are calibrated within 3% accuracy. Submit FOPM proposal for any corrections needed.' },
  { section: 'wicf', code: 'WICF8', applicability: A, description: "Check customer door LED's for burnt out diodes. Instructions found on linked document (Anthony Doors Replacement LED Order Form).", hint: 'The ALDI sheet links the Anthony Doors Replacement LED Order Form for this one.' },
  { section: 'wicf', code: 'WICF9', applicability: A, description: 'Check walk-in doors + man doors, gaskets and hinges for damage and ensure proper operation (Customer and stocking doors).' },
  { section: 'wicf', code: 'WICF10', applicability: A, photo: true, fopm: true, description: 'Visually inspect for signs of dented panels. Use thermal image camera to inspect overall box health (i.e., Seams sealed + no gaps at penetrations). Must provide photos of thermal imaging. Submit FOPM proposal for any corrections needed.' },
  { section: 'wicf', code: 'WICF11', applicability: A, description: "Verify Rollseal door settings/operation per 'Rollseal Settings' tab." },

  // ── General ──
  { section: 'rgen', code: 'RGEN1', applicability: A, fopm: true, description: 'Visually check all refrigerant/glycol pipe insulation and bracing conditions throughout the store. Any insulation degradation or insufficient bracing to be repaired. Must submit FOPM proposal if replacement is required.' },
  { section: 'rgen', code: 'RGEN2', applicability: 'CO2', fopm: true, measure: { label: 'UPS battery level', unit: '%', required: true }, description: 'Ensure battery backup system is clean and operational. Record Battery Level for onboard UPS in Service Technician Comments field located below. Must submit FOPM proposal if UPS needs replaced.' },
  { section: 'rgen', code: 'RGEN3', applicability: A, fopm: true, description: 'Check heat exchanger for corrosion and any signs of leakage. Submit FOPM proposal for any corrections needed.' },

  // ── Spot Merchandiser & curbside "self contained" ──
  { section: 'sm', code: 'SM1', applicability: A, description: 'Are there any unusual vibrations, noise or smell coming from the compressor area?', hint: QUESTION },
  { section: 'sm', code: 'SM4', applicability: A, description: "Verify self contained units are 'online' in BMCS portal. Investigate controller modbus address or cabling intergrity as needed." },

  // ── EVAC ──
  { section: 'evac', code: 'EVAC1', applicability: A, description: 'Check the unit for physical damage an any unusual noise/vibration.' },

  // ── HVAC units (perform on each unit). The sheet prints no refrigerant label on these. ──
  { section: 'hvac', code: 'HVAC1', applicability: '', description: 'Is there any physical damage to the units?', hint: QUESTION },
  { section: 'hvac', code: 'HVAC2', applicability: '', description: 'Are there any unusual vibrations or noise coming from the units?', hint: QUESTION },
  { section: 'hvac', code: 'HVAC3', applicability: '', description: 'Verify there are no active alarms.' },
  { section: 'hvac', code: 'HVAC4', applicability: '', description: 'Replace all media filters with Merv 8 or better pleated filters. Write date of install on each filter.', hint: 'Need filters ordered? Request them under Materials and this PM shows as Waiting on Filters.' },
  { section: 'hvac', code: 'HVAC5', applicability: '', description: 'After replacing filters, ensure that the clogged filter switch is calibrated correctly.' },
  { section: 'hvac', code: 'HVAC6', applicability: '', description: 'Check belt for proper adjustment. Replace belt if it is stretched or has excessive cracks.' },
  { section: 'hvac', code: 'HVAC7', applicability: '', description: 'Check pulley for excessive grooves and replace as needed.' },
  { section: 'hvac', code: 'HVAC8', applicability: '', description: 'If an idler pulley is installed, check bearing and replace pulley as needed.' },
  { section: 'hvac', code: 'HVAC9', applicability: '', description: 'Visually inspect for any oil stains that are indicative of a refrigerant leak. Leak check unit with Bacharach PGM detector (or equivalent).' },
  { section: 'hvac', code: 'HVAC10', applicability: '', description: 'Check all service valve caps and tighten.' },
  { section: 'hvac', code: 'HVAC11', applicability: '', description: 'Check sight glass oil levels on compressors (if applicable) and ensure proper levels for operation.' },
  { section: 'hvac', code: 'HVAC12', applicability: '', description: 'Verify all cabinet door seals are in good condition and replace if necessary.' },
  { section: 'hvac', code: 'HVAC13', applicability: '', description: 'Make sure all panels are reinstalled and secured and all disconnect switches are turned back on.' },
  { section: 'hvac', code: 'HVAC14', applicability: '', description: 'Inspect condenser fan motors and blades, and mounting brackets. Tighten any set screws.' },
  { section: 'hvac', code: 'HVAC15', applicability: '', description: 'For ductless mini-splits, clean the ceiling cassette unit(s) for the room(s) they service.' },
  { section: 'hvac', code: 'HVAC16', applicability: '', description: 'Inspect general exhaust fans for proper operation.' },
  { section: 'hvac', code: 'HVAC26', applicability: '', description: 'Exercise each damper blade to maximum and minimum position to ensure that blades are operating properly and open % matches in Siemens.', hint: 'Listed under Seasonal Items Only on the sheet.' },
]

const numbered = (label: string, n: number): DataRow[] => Array.from({ length: n }, (_, i) => ({ key: `d:${i + 1}`, label: `${label} ${i + 1}` }))
const repeated = (pairs: [string, number][]): DataRow[] => {
  const out: DataRow[] = []
  for (const [label, n] of pairs) for (let i = 0; i < n; i++) out.push({ key: `d:${out.length + 1}`, label })
  return out
}

/** The circuit rows printed on the Q2 sheet. A store's own circuits replace these once entered. */
export const DEFAULT_CIRCUITS = repeated([['A-1 Freezer', 3], ['A-4 Cooler', 3], ['A-5 Deli', 5], ['A-6 Meat', 3], ['A-7 Meat Cooler', 1], ['A-8 Produce', 4]])

export const ALDI_Q2_TABLES: DataTable[] = [
  {
    key: 'system_superheat', group: 'refrigeration', title: 'System Superheat', hint: 'Target 20 to 35 degrees. CO2 will vary.',
    rowSource: 'fixed', rows: [{ key: 'lt', label: 'LT' }, { key: 'mt', label: 'MT' }],
    columns: [{ key: 'reading', label: 'Superheat', unit: '°F' }],
  },
  {
    key: 'component', group: 'refrigeration', title: 'Component Superheat / Fan CFM', hint: 'Target 6 to 10 degrees.',
    rowSource: 'circuits', rows: DEFAULT_CIRCUITS,
    columns: [{ key: 'superheat', label: 'Superheat Reading', unit: '°F' }, { key: 'cfm', label: 'Fan CFM', unit: 'CFM' }],
  },
  {
    key: 'oil_discharge', group: 'refrigeration', title: 'Oil Level and Discharge Temp',
    rowSource: 'compressors', rows: numbered('Compressor', 6),
    columns: [{ key: 'oil_compressor', label: 'Oil level in compressor' }, { key: 'oil_reservoir', label: 'Oil level in reservoir' }, { key: 'discharge_temp', label: 'Discharge temp', unit: '°F' }],
  },
  {
    key: 'refrigeration_comments', group: 'refrigeration', title: 'Refrigeration Data Entry comments',
    rowSource: 'fixed', rows: [{ key: 'comments', label: 'Comments' }], columns: [{ key: 'text', label: 'Comments' }],
  },
  {
    key: 'electrical', group: 'electrical', title: 'Electrical Readings',
    hint: 'Ensure compressors are running at full load when measuring amp draw. Refer to nameplate/data sheet for full load amps.',
    rowSource: 'compressors', rows: numbered('Compressor', 6),
    columns: [
      { key: 'fla', label: 'Input FLA from Data Plate' },
      { key: 'l1_v', label: 'L1 (Volts)' }, { key: 'l2_v', label: 'L2 (Volts)' }, { key: 'l3_v', label: 'L3 (Volts)' },
      { key: 'l1l2_v', label: 'L1-L2 (Volts)' }, { key: 'l2l3_v', label: 'L2-L3 (Volts)' }, { key: 'l3l1_v', label: 'L3-L1 (Volts)' },
      { key: 'l1l2_ohm', label: 'L1-L2 (Ohms)' }, { key: 'l2l3_ohm', label: 'L2-L3 (Ohms)' }, { key: 'l3l1_ohm', label: 'L3-L1 (Ohms)' },
      { key: 'l1_a', label: 'L1 (Amps)' }, { key: 'l2_a', label: 'L2 (Amps)' }, { key: 'l3_a', label: 'L3 (Amps)' },
      { key: 'l1_prior', label: 'L1 (Prior Amps)' }, { key: 'l2_prior', label: 'L2 (Prior Amps)' }, { key: 'l3_prior', label: 'L3 (Prior Amps)' },
    ],
  },
  {
    key: 'hvac_voltage', group: 'hvac', title: 'HVAC Actual Voltage',
    rowSource: 'fixed', rows: [{ key: 'actual', label: 'Actual voltage' }],
    columns: [{ key: 'l1l2', label: 'L1 to L2', unit: 'V' }, { key: 'l1l3', label: 'L1 to L3', unit: 'V' }, { key: 'l2l3', label: 'L2 to L3', unit: 'V' }],
  },
  {
    key: 'hvac_amps', group: 'hvac', title: 'HVAC Compressor Amps',
    hint: 'Ensure compressors are running at full load when measuring amp draw. Refer to nameplate/data sheet for full load amps.',
    rowSource: 'hvac_compressors', rows: numbered('Compressor', 4),
    columns: [{ key: 'l1l2', label: 'L1 to L2', unit: 'A' }, { key: 'l1l3', label: 'L1 to L3', unit: 'A' }, { key: 'l2l3', label: 'L2 to L3', unit: 'A' }],
  },
  {
    key: 'hvac_sensors', group: 'hvac', title: '(HVAC) Sensor Calibration',
    rowSource: 'fixed',
    rows: [{ key: 'space', label: 'Space Temp' }, { key: 'wb', label: 'WB / DewPt.' }, { key: 'oat', label: 'OAT' }, { key: 'rat', label: 'RAT' }, { key: 'co2', label: 'CO2' }],
    columns: [{ key: 'controller', label: 'Controller' }, { key: 'actual', label: 'Actual' }, { key: 'offset', label: 'Offset' }],
  },
  {
    key: 'hvac_comments', group: 'hvac', title: 'HVAC comments',
    rowSource: 'fixed', rows: [{ key: 'rla', label: 'RLA, Voltage, Comments' }, { key: 'additional', label: 'Additional Comments' }],
    columns: [{ key: 'text', label: 'Comments' }],
  },
]

export const ALDI_Q2_TEMPLATE = {
  name: 'ALDI HVACR Preventative Maintenance Checklist',
  quarter: 2,
  revisionLabel: 'Rev: 01_01_25',
  items: ALDI_Q2_ITEMS,
  dataTables: ALDI_Q2_TABLES,
}

/** A table whose only column is free text renders as comment boxes, not a grid. */
export const isNotesTable = (t: DataTable) => t.columns.length === 1 && t.columns[0].key === 'text'

/** Seed rows ready for pm_template_items. */
export function seedItemRows(items: SeedItem[]) {
  return items.map((it, i) => ({
    section_key: it.section,
    section_label: sectionLabel(it.section),
    sort_order: (i + 1) * 10,
    code: it.code,
    applicability: it.applicability,
    description: it.description,
    requires_photo: !!it.photo,
    requires_note: !!it.note,
    measure_label: it.measure?.label ?? null,
    measure_unit: it.measure?.unit ?? null,
    requires_measure: !!it.measure?.required,
    reading_refs: it.readings ?? [],
    fopm_on_fail: !!it.fopm,
    hint: it.hint ?? null,
  }))
}

/**
 * The rows a PM's data tables use. A store that lists its own circuits or
 * compressors gets those; otherwise the rows printed on the sheet.
 */
export function buildLayout(tables: DataTable[], equipment: Pick<PmEquipment, 'id' | 'kind' | 'label' | 'sortOrder' | 'isActive'>[]): PmLayout {
  const own = (kind: string): DataRow[] => equipment
    .filter((e) => e.isActive && e.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((e) => ({ key: `eq:${e.id}`, label: e.label }))
  const defaults = (source: string): DataRow[] => tables.find((t) => t.rowSource === source)?.rows ?? []
  const pick = (kind: string, source: string) => { const mine = own(kind); return mine.length ? mine : defaults(source) }
  return {
    circuits: pick('circuit', 'circuits'),
    compressors: pick('compressor', 'compressors'),
    hvac_compressors: pick('hvac_compressor', 'hvac_compressors'),
  }
}

export function rowsFor(table: DataTable, layout: PmLayout | null): DataRow[] {
  if (table.rowSource === 'fixed' || !layout) return table.rows
  const rows = layout[table.rowSource]
  return rows?.length ? rows : table.rows
}

/** "A-1 Freezer" three times over becomes "A-1 Freezer (1)", "(2)", "(3)". */
export function rowLabels(rows: DataRow[]): Record<string, string> {
  const total = new Map<string, number>()
  for (const r of rows) total.set(r.label, (total.get(r.label) ?? 0) + 1)
  const seen = new Map<string, number>()
  const out: Record<string, string> = {}
  for (const r of rows) {
    const n = (seen.get(r.label) ?? 0) + 1
    seen.set(r.label, n)
    out[r.key] = (total.get(r.label) ?? 1) > 1 ? `${r.label} (${n})` : r.label
  }
  return out
}
