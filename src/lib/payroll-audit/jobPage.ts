// Reads the property address off the text of a Kalos job page
// (live.kalosflorida.com/project/<job>). Pure and tested; the worker only
// ships page text. Page layout, as observed:
//
//   Property Information
//   Property Address
//   3420 S US Highway 27 #0674
//   City, State, ZIP
//   Clermont, FL 34711
//   Project Details
//   Project Name
//   ...
//   Job Number
//   266105

export interface JobPage {
  jobNumber: string | null
  projectName: string | null
  customer: string | null
  street: string | null
  cityStateZip: string | null
}

const LABELS = [
  'Property Address', 'City, State, ZIP', 'Project Name', 'Job Number', 'Customer Name', 'Business Name', 'Job ID',
  'PO Number', 'Status', 'Primary Phone', 'Email', 'Project Details', 'Property Information', 'Customer Information',
]
const EMPTY = /^(n\/a|none|-+|unknown|tbd)$/i

export function parseJobPage(text: string): JobPage {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const labelSet = new Set(LABELS.map((l) => l.toLowerCase()))
  const value = (label: string): string | null => {
    const i = lines.findIndex((l) => l.toLowerCase() === label.toLowerCase())
    if (i < 0 || i + 1 >= lines.length) return null
    const v = lines[i + 1]
    if (labelSet.has(v.toLowerCase()) || EMPTY.test(v)) return null
    return v
  }
  return {
    jobNumber: value('Job Number'),
    projectName: value('Project Name'),
    customer: value('Customer Name'),
    street: value('Property Address'),
    cityStateZip: value('City, State, ZIP'),
  }
}

/**
 * Geocoding queries, most specific first. Store numbers and suite markers
 * ("#0674") trip up geocoders, so the second try drops them; the last resort
 * is the town alone, which is marked approximate so nobody mistakes it for a
 * door.
 */
export function addressQueries(p: Pick<JobPage, 'street' | 'cityStateZip'>): { query: string; approximate: boolean }[] {
  const out: { query: string; approximate: boolean }[] = []
  const csz = p.cityStateZip?.trim() || ''
  const street = p.street?.trim() || ''
  if (street && csz) out.push({ query: `${street}, ${csz}`, approximate: false })
  const bare = street.replace(/\s*(#|no\.?|unit|ste\.?|suite|bldg\.?|building)\s*[\w-]+\s*$/i, '').replace(/\s*#\S+/g, '').trim()
  if (bare && bare !== street && csz) out.push({ query: `${bare}, ${csz}`, approximate: false })
  if (csz) out.push({ query: csz, approximate: true })
  return out
}

/** One line for display and storage. */
export function addressLine(p: Pick<JobPage, 'street' | 'cityStateZip'>): string | null {
  const parts = [p.street, p.cityStateZip].map((x) => x?.trim()).filter(Boolean)
  return parts.length ? parts.join(', ') : null
}
