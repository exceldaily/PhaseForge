import { describe, it, expect } from 'vitest'
import { parsePunchPdfText } from './punchPdf'

describe('parsePunchPdfText — versatile punch layouts', () => {
  it('reads a repeating title-block table (EMJ / Walmart style)', () => {
    // The exact shape pdf.js extracts from the Walmart 2345 punch PDF: page
    // headers repeat, column labels repeat, the item number echoes, and
    // descriptions wrap across lines.
    const text = [
      'Walmart 2345', 'Walmart 2345',
      'Walmart 2345.1 Lady Lake Fl', 'Walmart 2345.1 Lady Lake Fl',
      'EMJ', 'EMJ', 'Apr 21, 2026', 'Apr 21, 2026', 'Ronald Horst', 'Ronald Horst',
      'ITEM', 'ITEM', 'FLOOR', 'FLOOR', 'ROOM', 'ROOM', 'SHEET', 'SHEET', 'ISSUE', 'COMMENTS',
      '1', '1   Not correct emt clamp.',
      'ITEM', 'ITEM', 'FLOOR', 'FLOOR', 'ROOM', 'ROOM', 'SHEET', 'SHEET', 'ISSUE', 'COMMENTS',
      '3', '3   Power for all RTUs need to be', 'in conduit as per manufacture', 'instructions',
      // page 2 header block repeats
      'Walmart 2345', 'Walmart 2345',
      'Walmart 2345.1 Lady Lake Fl', 'Walmart 2345.1 Lady Lake Fl',
      'EMJ', 'EMJ', 'Apr 21, 2026', 'Apr 21, 2026', 'Ronald Horst', 'Ronald Horst',
      'ITEM', 'ITEM', 'FLOOR', 'FLOOR', 'ROOM', 'ROOM', 'SHEET', 'SHEET', 'ISSUE', 'COMMENTS',
      '6', '6   Clean off top of all walk ins',
    ].join('\n')
    const items = parsePunchPdfText(text)
    expect(items.map((i) => i.description)).toEqual([
      'Not correct emt clamp.',
      'Power for all RTUs need to be in conduit as per manufacture instructions',
      'Clean off top of all walk ins',
    ])
  })

  it('reads a plain numbered list ("1. " / "2) ")', () => {
    const text = '1. Fix broken outlet in break room\n2) Seal gap under door 14\n3 - Replace ceiling tile'
    const items = parsePunchPdfText(text)
    expect(items).toEqual([
      { description: 'Fix broken outlet in break room', location: null },
      { description: 'Seal gap under door 14', location: null },
      { description: 'Replace ceiling tile', location: null },
    ])
  })

  it('de-duplicates repeated descriptions and skips short noise', () => {
    const text = '1. Touch up paint\n1. Touch up paint\nStatus\n2. Caulk window'
    expect(parsePunchPdfText(text).map((i) => i.description)).toEqual(['Touch up paint', 'Caulk window'])
  })
})
