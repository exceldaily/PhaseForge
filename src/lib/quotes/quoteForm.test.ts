import { describe, it, expect } from 'vitest'
import { parseQuoteForm, parseQuoteFormLoose } from './quoteForm'

// The strict parser targets one exact Google Form. Anything else used to be
// rejected outright ("does not look like one of your quote forms"), which is
// what made PDF intake feel broken for other form layouts.
const KALOS_FORM =
  'PO NUMBER 4471 Order Type Standard What Trade will this order be for? Refrigeration ' +
  'Your Name Justin Miller Do You Have A Job Number For This Request? Yes ' +
  'If Yes, What Is the Job Number? 5932-251 Do You Have A Store Number For This Request? Yes ' +
  'If Yes, What Is The Store Number? 251 How Do We Need To Process This Order Quote ' +
  'Add Any Additional Items (2) Copeland ZF15K compressors, 3 EPR valves'

describe('parseQuoteForm (strict)', () => {
  it('reads the known form layout', () => {
    const f = parseQuoteForm(KALOS_FORM)
    expect(f).not.toBeNull()
    expect(f!.poNumber).toBe('4471')
    expect(f!.jobNumber).toBe('5932-251')
    expect(f!.storeNumber).toBe('251')
    expect(f!.trade).toBe('Refrigeration')
    expect(f!.techName).toBe('Justin Miller')
  })

  it('rejects text that is not that form', () => {
    expect(parseQuoteForm('Invoice 12345 for services rendered, net 30 terms.')).toBeNull()
  })
})

describe('parseQuoteFormLoose (fallback)', () => {
  it('reads a differently-worded RFQ sheet', () => {
    const f = parseQuoteFormLoose(
      'MATERIAL REQUEST FORM\nJob #: 2533-1012\nStore #: 1012\nPO: 88231\n' +
      'Trade: Refrigeration\nTechnician: Carlos Betancourt\n' +
      'Items Needed:\n(4) 3/4" ball valves\n(2) Copeland compressors ZF09',
    )
    expect(f.jobNumber).toBe('2533-1012')
    expect(f.storeNumber).toBe('1012')
    expect(f.poNumber).toBe('88231')
    expect(f.trade).toBe('Refrigeration')
    expect(f.techName).toBe('Carlos Betancourt')
    expect(f.itemsText).toContain('ball valves')
  })

  it('still keeps the text when there are no labels at all', () => {
    const f = parseQuoteFormLoose('Need pricing on 3 evaporator coils and 2 TXVs for Sarasota')
    expect(f.itemsText).toContain('evaporator coils')
  })

  it('picks up a bare job number in free text', () => {
    const f = parseQuoteFormLoose('Job 7298-1000 need pricing on 3 evaporator coils')
    expect(f.jobNumber).toBe('7298-1000')
  })
})
