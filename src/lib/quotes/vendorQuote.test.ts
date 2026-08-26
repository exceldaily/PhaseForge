import { describe, it, expect } from 'vitest'
import { parseVendorQuote, computeTotals, lineSell, type PriceLineInput } from './vendorQuote'

// Every supplier prints a different sheet. These are the shapes we actually
// see back from refrigeration and HVAC vendors.
const COLUMNS = `
ACME REFRIGERATION SUPPLY
Quote #: Q-88421
QTY  U/M  DESCRIPTION                 UNIT PRICE   EXTENDED
2    EA   Copeland ZF15K compressor      845.00     1,690.00
3    EA   Sporlan EPR valve 1-1/8"       212.50       637.50
1    BOX  Copper fittings assortment      74.25        74.25
Freight                                              125.00
Sales Tax                                             98.40
Total                                              2,625.15
`

const NO_QTY_COLUMN = `
Description                      Price      Amount
Scroll compressor 5 ton         $1,240.00  $1,240.00
Liquid line drier               $   48.75  $   48.75
Subtotal                                   $1,288.75
`

const SINGLE_COLUMN = `
Parts Quote
Condenser fan motor 1/3 HP      189.99
Fan blade 22"                    42.50
Shipping                         18.00
Amount Due                      250.49
`

describe('parseVendorQuote', () => {
  it('reads a qty / unit price / extended layout', () => {
    const q = parseVendorQuote(COLUMNS)
    expect(q.lines).toHaveLength(3)
    expect(q.lines[0]).toMatchObject({ description: 'Copeland ZF15K compressor', qty: 2, unit: 'EA', unitCost: 845 })
    expect(q.lines[1]).toMatchObject({ qty: 3, unitCost: 212.5 })
    expect(q.lines[2]).toMatchObject({ qty: 1, unit: 'BOX', unitCost: 74.25 })
  })

  it('pulls freight and tax off the summary rows instead of pricing them as parts', () => {
    const q = parseVendorQuote(COLUMNS)
    expect(q.freight).toBe(125)
    expect(q.tax).toBe(98.4)
    expect(q.documentTotal).toBe(2625.15)
    expect(q.lines.some((l) => /freight|tax|total/i.test(l.description))).toBe(false)
  })

  it('keeps the quote number', () => {
    expect(parseVendorQuote(COLUMNS).quoteNumber).toBe('Q-88421')
  })

  it('handles a quote with no qty column', () => {
    const q = parseVendorQuote(NO_QTY_COLUMN)
    expect(q.lines).toHaveLength(2)
    expect(q.lines[0]).toMatchObject({ description: 'Scroll compressor 5 ton', qty: 1, unitCost: 1240 })
  })

  it('handles a single money column', () => {
    const q = parseVendorQuote(SINGLE_COLUMN)
    expect(q.lines.map((l) => l.description)).toEqual(['Condenser fan motor 1/3 HP', 'Fan blade 22"'])
    expect(q.freight).toBe(18)
  })

  it('backs the unit price out of the extended amount when the two disagree', () => {
    // 4 x 25.00 printed as 120.00: the vendor is charging 120, so unit is 30.
    const q = parseVendorQuote('4 EA Widget 25.00 120.00')
    expect(q.lines[0]).toMatchObject({ qty: 4, unitCost: 30, extended: 120 })
  })

  it('skips headers, dates, phone numbers, and address blocks', () => {
    const q = parseVendorQuote([
      'Bill To: Kalos Services', '08/26/2026', '(352) 448-2665',
      'QTY DESCRIPTION PRICE', 'Page 1 of 2',
    ].join('\n'))
    expect(q.lines).toHaveLength(0)
  })

  it('returns nothing rather than guessing on empty or junk input', () => {
    expect(parseVendorQuote('').lines).toHaveLength(0)
    expect(parseVendorQuote('   \n \n').lines).toHaveLength(0)
  })
})

const line = (over: Partial<PriceLineInput>): PriceLineInput => ({
  kind: 'material', description: 'x', qty: 1, unitCost: 100, markupPct: null, taxable: true, ...over,
})

describe('pricing math', () => {
  const settings = { defaultMarkupPct: 20, taxPct: 7 }

  it('applies the sheet default markup', () => {
    expect(lineSell(line({ qty: 2, unitCost: 50 }), settings)).toBe(120)
  })

  it('lets a line override the default', () => {
    expect(lineSell(line({ unitCost: 100, markupPct: 50 }), settings)).toBe(150)
    expect(lineSell(line({ unitCost: 100, markupPct: 0 }), settings)).toBe(100)
  })

  it('totals cost, markup, tax, and margin', () => {
    const t = computeTotals([
      line({ kind: 'material', qty: 2, unitCost: 100 }),          // 200 -> 240
      line({ kind: 'labor', qty: 4, unitCost: 65, markupPct: 0 }), // 260 -> 260
    ], settings)
    expect(t.cost).toBe(460)
    expect(t.subtotal).toBe(500)
    expect(t.markup).toBe(40)
    expect(t.tax).toBe(35)
    expect(t.total).toBe(535)
    expect(t.byKind.material.sell).toBe(240)
    expect(t.byKind.labor.sell).toBe(260)
    expect(t.marginPct).toBe(8)
  })

  it('only taxes the lines marked taxable', () => {
    const t = computeTotals([
      line({ qty: 1, unitCost: 100, markupPct: 0, taxable: true }),
      line({ kind: 'labor', qty: 1, unitCost: 100, markupPct: 0, taxable: false }),
    ], settings)
    expect(t.subtotal).toBe(200)
    expect(t.tax).toBe(7)
  })

  it('is safe on an empty sheet', () => {
    const t = computeTotals([], settings)
    expect(t.total).toBe(0)
    expect(t.marginPct).toBe(0)
  })
})
