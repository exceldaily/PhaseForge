// Default per-trade reading field sets for equipment updates. Organizations
// can override these later via the reading_templates table; until then, the
// asset's trade_category picks the right form automatically. This is what
// makes the platform adapt to whoever buys it — an HVAC company gets system
// readings, a plumber gets water-side checks, an electrician gets power checks.

export interface ReadingField {
  key: string
  label: string
  unit?: string
  type: 'number' | 'text' | 'select'
  options?: string[]
}

export const DEFAULT_READING_TEMPLATES: Record<string, ReadingField[]> = {
  hvac: [
    { key: 'suction_psi', label: 'Suction pressure', unit: 'psi', type: 'number' },
    { key: 'head_psi', label: 'Head pressure', unit: 'psi', type: 'number' },
    { key: 'superheat_f', label: 'Superheat', unit: '°F', type: 'number' },
    { key: 'subcooling_f', label: 'Subcooling', unit: '°F', type: 'number' },
    { key: 'return_temp_f', label: 'Return air temp', unit: '°F', type: 'number' },
    { key: 'supply_temp_f', label: 'Supply air temp', unit: '°F', type: 'number' },
    { key: 'compressor_amps', label: 'Compressor amps', unit: 'A', type: 'number' },
    { key: 'filter_condition', label: 'Filter condition', type: 'select', options: ['Good', 'Dirty — replaced', 'Dirty — needs replacement'] },
  ],
  refrigeration: [
    { key: 'case_temp_f', label: 'Case/box temp', unit: '°F', type: 'number' },
    { key: 'setpoint_f', label: 'Setpoint', unit: '°F', type: 'number' },
    { key: 'suction_psi', label: 'Suction pressure', unit: 'psi', type: 'number' },
    { key: 'discharge_psi', label: 'Discharge pressure', unit: 'psi', type: 'number' },
    { key: 'superheat_f', label: 'Superheat', unit: '°F', type: 'number' },
    { key: 'defrost_ok', label: 'Defrost operation', type: 'select', options: ['Normal', 'Irregular', 'Failed'] },
    { key: 'coil_condition', label: 'Coil condition', type: 'select', options: ['Clean', 'Light frost', 'Iced — cleared', 'Iced — needs service'] },
  ],
  electrical: [
    { key: 'voltage_l1', label: 'Voltage L1', unit: 'V', type: 'number' },
    { key: 'voltage_l2', label: 'Voltage L2', unit: 'V', type: 'number' },
    { key: 'voltage_l3', label: 'Voltage L3', unit: 'V', type: 'number' },
    { key: 'amp_draw', label: 'Amp draw', unit: 'A', type: 'number' },
    { key: 'breaker_condition', label: 'Breaker/panel condition', type: 'select', options: ['Good', 'Signs of heat', 'Needs replacement'] },
    { key: 'grounding_ok', label: 'Grounding check', type: 'select', options: ['Pass', 'Fail'] },
  ],
  plumbing: [
    { key: 'water_pressure_psi', label: 'Water pressure', unit: 'psi', type: 'number' },
    { key: 'water_heater_temp_f', label: 'Water heater temp', unit: '°F', type: 'number' },
    { key: 'leak_check', label: 'Leak check', type: 'select', options: ['No leaks', 'Minor — repaired', 'Active leak'] },
    { key: 'drain_flow', label: 'Drain flow', type: 'select', options: ['Clear', 'Slow', 'Blocked'] },
  ],
  general: [
    { key: 'condition', label: 'Overall condition', type: 'select', options: ['Good', 'Fair', 'Poor', 'Failed'] },
    { key: 'work_performed', label: 'Work performed', type: 'text' },
  ],
}

export function readingFieldsForTrade(trade: string | null | undefined): ReadingField[] {
  return DEFAULT_READING_TEMPLATES[trade ?? 'general'] ?? DEFAULT_READING_TEMPLATES.general
}

// Google Maps link from address parts — a plain URL, no API, no key, no SDK.
export function mapsUrl(...parts: (string | null | undefined)[]): string | null {
  const q = parts.filter(Boolean).join(', ')
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}
