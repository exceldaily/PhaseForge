import type { PlanSetType } from '@/types/plans'

// Seed list only — disciplines are free text in the DB, so orgs can add their
// own. This list drives detection, grouping order, and the discipline picker.
export const STANDARD_DISCIPLINES = [
  'General',
  'Civil',
  'Landscape',
  'Architectural',
  'Structural',
  'Mechanical',
  'Plumbing',
  'Electrical',
  'Fire Protection',
  'Refrigeration',
  'Controls',
  'Equipment',
  'Details',
  'Specifications',
  'Shop Drawings',
  'Other',
] as const

/** Sheet-number prefix → discipline used by auto-detection. */
export const DISCIPLINE_PREFIXES: Record<string, string> = {
  G: 'General', GI: 'General', GN: 'General',
  C: 'Civil', CU: 'Civil',
  L: 'Landscape', LS: 'Landscape',
  A: 'Architectural', AD: 'Architectural', AS: 'Architectural',
  S: 'Structural', SF: 'Structural',
  M: 'Mechanical', H: 'Mechanical', HV: 'Mechanical',
  P: 'Plumbing', PL: 'Plumbing',
  E: 'Electrical', EL: 'Electrical', ES: 'Electrical',
  FP: 'Fire Protection', F: 'Fire Protection', FA: 'Fire Protection',
  R: 'Refrigeration', RF: 'Refrigeration',
  T: 'Controls', BAS: 'Controls', BC: 'Controls',
  Q: 'Equipment', EQ: 'Equipment',
  D: 'Details', DT: 'Details',
  SP: 'Specifications',
  SD: 'Shop Drawings',
}

/** Display order for grouped sheet lists (unknown disciplines sort after). */
export const DISCIPLINE_ORDER: string[] = [...STANDARD_DISCIPLINES]

export const SET_TYPES: { value: PlanSetType; label: string }[] = [
  { value: 'construction', label: 'Construction Set' },
  { value: 'permit',       label: 'Permit Set' },
  { value: 'bid',          label: 'Bid Set' },
  { value: 'as_built',     label: 'As-Built' },
  { value: 'addendum',     label: 'Addendum' },
  { value: 'shop',         label: 'Shop Drawings' },
  { value: 'other',        label: 'Other' },
]

export const MARKUP_COLORS = [
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // yellow
  '#16a34a', // green
  '#2563eb', // blue
  '#7c3aed', // violet
  '#0f172a', // near-black
] as const

export function disciplineRank(d: string): number {
  const i = DISCIPLINE_ORDER.indexOf(d)
  return i === -1 ? DISCIPLINE_ORDER.length : i
}

/** Natural sort for sheet numbers: A1.01 < A1.02 < A2.01 < A10.01, M before… */
export function compareSheetNumbers(a: string, b: string): number {
  const split = (s: string) => s.toUpperCase().split(/(\d+(?:\.\d+)?)/).filter(Boolean)
  const pa = split(a), pb = split(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '', y = pb[i] ?? ''
    const nx = parseFloat(x), ny = parseFloat(y)
    const bothNum = !isNaN(nx) && !isNaN(ny)
    if (bothNum) { if (nx !== ny) return nx - ny }
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}
