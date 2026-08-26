// Vendor quote intake and bid pricing — pure functions, no I/O.
//
// Two jobs:
//   1. parseVendorQuote(): pull line items out of the quote a vendor sends
//      back. Every supplier prints a different layout, so this reads shapes
//      (a description followed by money) rather than one fixed template, the
//      same way the punch-list PDF parser does.
//   2. computeTotals(): cost -> markup -> sell, across material lines and the
//      labor / travel / other lines added by hand.
//
// Money is rounded to cents per line and then summed, so what the sheet shows
// and what it adds up to can never disagree by a stray fraction of a cent.

export type PriceLineKind = 'material' | 'labor' | 'travel' | 'other'

export const PRICE_LINE_KINDS: { key: PriceLineKind; label: string; unit: string }[] = [
  { key: 'material', label: 'Material', unit: 'ea' },
  { key: 'labor',    label: 'Labor',    unit: 'hr' },
  { key: 'travel',   label: 'Travel',   unit: 'mi' },
  { key: 'other',    label: 'Other',    unit: 'ea' },
]

export interface ParsedQuoteLine {
  description: string
  qty: number
  unit: string | null
  unitCost: number
  /** The extended amount as printed, when the quote showed one. */
  extended: number | null
}

export interface ParsedVendorQuote {
  lines: ParsedQuoteLine[]
  /** Freight / shipping charged on the quote, worth carrying as a cost line. */
  freight: number | null
  tax: number | null
  documentTotal: number | null
  quoteNumber: string | null
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** "$1,234.56" / "1234.56" / "(45.00)" -> number, or null. */
function money(raw: string): number | null {
  const neg = /^\(.*\)$/.test(raw.trim())
  const n = Number(raw.replace(/[()$,\s]/g, ''))
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

// A money token: optional $, thousands separators, and either two decimals or
// none. Requiring the decimals everywhere would drop "45" unit prices; allowing
// bare integers everywhere would swallow part numbers, so bare integers only
// count when they sit in a column position (handled per-pattern below).
const MONEY = String.raw`\$?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?|\$?\(?\d+\.\d{2}\)?`

const UNITS = 'EA|EACH|PC|PCS|PK|PR|BX|BOX|CS|CASE|CTN|RL|ROLL|FT|LF|LN|IN|YD|GAL|QT|LB|LBS|KG|HR|HRS|DAY|SET|KIT|BAG|TUBE|CAN'

/** Lines that are totals, not items. */
const SUMMARY = /^\s*(sub\s*-?\s*total|total|grand\s+total|amount\s+due|balance\s+due|sales\s+tax|tax|freight|shipping(?:\s*&?\s*handling)?|handling|delivery|misc\s+charges?)\b/i

/** Column headers and boilerplate that happen to carry numbers. */
const NOISE = new RegExp([
  String.raw`^\s*(qty|quantity|item|items?\s*#|line|part|description|desc|unit|u\/m|uom|price|unit\s*price|ext(?:ended)?|amount|total)\b[\s|]*$`,
  String.raw`^\s*page\s+\d+`,
  String.raw`^\s*(quote|estimate|proposal|invoice|bill\s*to|ship\s*to|sold\s*to|remit|terms|f\.?o\.?b\.?|phone|fax|email|www\.|http)`,
  String.raw`^\s*[\d/.-]{6,12}\s*$`,                       // a bare date
  String.raw`^\s*\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\s*$`,   // a bare phone number
].join('|'), 'i')

const looksLikeDescription = (s: string): boolean =>
  s.length >= 3 && /[A-Za-z]{2}/.test(s) && !NOISE.test(s)

const clean = (s: string): string =>
  s.replace(/\s+/g, ' ').replace(/^[|:\-\s.]+|[|:\-\s.]+$/g, '').trim()

/**
 * Read the line items off a vendor's quote.
 *
 * Deliberately conservative: a row has to end in money to count, so a wrapped
 * description or an odd layout yields fewer rows rather than garbage ones. The
 * pricing sheet is editable, so a missed row costs a moment; an invented row
 * with a real-looking price is the expensive mistake.
 */
export function parseVendorQuote(text: string): ParsedVendorQuote {
  const out: ParsedVendorQuote = { lines: [], freight: null, tax: null, documentTotal: null, quoteNumber: null }
  if (!text?.trim()) return out

  const qn = text.match(/\b(?:quote|estimate|proposal)\s*(?:#|no\.?|number)\s*[:\-]?\s*([A-Za-z0-9][\w\-/]{2,20})\b/i)
  out.quoteNumber = qn?.[1] ?? null

  // qty [unit] description unit-price extended
  const withQty = new RegExp(
    String.raw`^\s*(?:\d{1,3}\s+)?` +                       // optional line number
    String.raw`(\d{1,5}(?:\.\d{1,3})?)\s*` +                // qty
    String.raw`(?:(${UNITS})\b)?\s+` +                      // optional unit
    String.raw`(.+?)\s+` +                                  // description
    String.raw`(${MONEY})\s+(${MONEY})\s*$`,                // unit price, extended
    'i',
  )
  // description unit-price extended  (qty implied 1)
  const noQty = new RegExp(String.raw`^\s*(.+?)\s+(${MONEY})\s+(${MONEY})\s*$`)
  // description amount  (single money column)
  const oneCol = new RegExp(String.raw`^\s*(.+?)\s+(\$?\(?\d{1,3}(?:,\d{3})*\.\d{2}\)?)\s*$`)
  // qty [unit] description amount
  const qtyOneCol = new RegExp(
    String.raw`^\s*(\d{1,5}(?:\.\d{1,3})?)\s*(?:(${UNITS})\b)?\s+(.+?)\s+(\$?\(?\d{1,3}(?:,\d{3})*\.\d{2}\)?)\s*$`,
    'i',
  )

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    if (SUMMARY.test(line)) {
      const amounts = line.match(new RegExp(MONEY, 'g'))?.map(money).filter((n): n is number => n !== null) ?? []
      const amount = amounts.length ? amounts[amounts.length - 1] : null
      if (amount === null) continue
      if (/freight|shipping|handling|delivery/i.test(line)) out.freight = amount
      else if (/tax/i.test(line)) out.tax = amount
      else if (/grand\s+total|amount\s+due|balance\s+due|^total/i.test(line)) out.documentTotal = amount
      continue
    }
    if (NOISE.test(line)) continue

    const push = (description: string, qty: number, unit: string | null, unitCost: number, extended: number | null) => {
      const desc = clean(description)
      if (!looksLikeDescription(desc)) return
      if (!Number.isFinite(unitCost) || unitCost < 0) return
      if (qty <= 0) qty = 1
      // When both columns are printed and they disagree, the extended amount
      // is the one the vendor is actually charging — back the unit price out
      // of it rather than shipping a total that does not match the PDF.
      let cost = unitCost
      if (extended !== null && Math.abs(round2(qty * unitCost) - extended) > 0.02) cost = round2(extended / qty)
      out.lines.push({ description: desc, qty, unit: unit ? unit.toUpperCase() : null, unitCost: round2(cost), extended })
    }

    let m = line.match(withQty)
    if (m) {
      const unitCost = money(m[4]), ext = money(m[5])
      if (unitCost !== null) { push(m[3], Number(m[1]), m[2] ?? null, unitCost, ext); continue }
    }
    m = line.match(qtyOneCol)
    if (m) {
      const amount = money(m[4])
      // One money column after a qty is the extended amount for that row.
      if (amount !== null) {
        const qty = Number(m[1])
        push(m[3], qty, m[2] ?? null, qty > 0 ? round2(amount / qty) : amount, amount)
        continue
      }
    }
    m = line.match(noQty)
    if (m) {
      const unitCost = money(m[2]), ext = money(m[3])
      if (unitCost !== null) { push(m[1], 1, null, unitCost, ext); continue }
    }
    m = line.match(oneCol)
    if (m) {
      const amount = money(m[2])
      if (amount !== null) push(m[1], 1, null, amount, amount)
    }
  }

  return out
}

/* ───────────────────────────── pricing math ───────────────────────────── */

export interface PriceLineInput {
  kind: PriceLineKind
  description: string
  qty: number
  unitCost: number
  /** null inherits the sheet's default markup. */
  markupPct: number | null
  taxable: boolean
}

export interface PricingSettings {
  defaultMarkupPct: number
  taxPct: number
}

export interface KindTotal { cost: number; sell: number }

export interface PricingTotals {
  cost: number
  markup: number
  subtotal: number
  tax: number
  total: number
  byKind: Record<PriceLineKind, KindTotal>
  /** Gross margin on the sell price, which is not the same as the markup. */
  marginPct: number
}

export const effectiveMarkup = (line: { markupPct: number | null }, s: PricingSettings): number =>
  line.markupPct ?? s.defaultMarkupPct

export const lineCost = (line: { qty: number; unitCost: number }): number =>
  round2((Number(line.qty) || 0) * (Number(line.unitCost) || 0))

export const lineSell = (line: PriceLineInput, s: PricingSettings): number =>
  round2(lineCost(line) * (1 + effectiveMarkup(line, s) / 100))

export function computeTotals(lines: PriceLineInput[], s: PricingSettings): PricingTotals {
  const byKind: Record<PriceLineKind, KindTotal> = {
    material: { cost: 0, sell: 0 }, labor: { cost: 0, sell: 0 },
    travel: { cost: 0, sell: 0 }, other: { cost: 0, sell: 0 },
  }
  let cost = 0, sell = 0, taxable = 0
  for (const line of lines) {
    const c = lineCost(line)
    const sl = lineSell(line, s)
    byKind[line.kind].cost = round2(byKind[line.kind].cost + c)
    byKind[line.kind].sell = round2(byKind[line.kind].sell + sl)
    cost = round2(cost + c)
    sell = round2(sell + sl)
    if (line.taxable) taxable = round2(taxable + sl)
  }
  const tax = round2(taxable * (Number(s.taxPct) || 0) / 100)
  return {
    cost,
    markup: round2(sell - cost),
    subtotal: sell,
    tax,
    total: round2(sell + tax),
    byKind,
    marginPct: sell > 0 ? round2(((sell - cost) / sell) * 100) : 0,
  }
}

export function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
