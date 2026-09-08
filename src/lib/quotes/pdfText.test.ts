import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { extractPdfText } from './pdfText'

// The bug this pins: vendor quote templates built as fillable PDFs keep
// their words in AcroForm FIELD VALUES. getTextContent alone sees blank
// pages, so the app told users their perfectly good PDF "looks like a scan".

async function makeFormOnlyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage([612, 792])
  const form = doc.getForm()
  const page = doc.getPage(0)

  const vendor = form.createTextField('vendor_name')
  vendor.setText('ACME Refrigeration Supply')
  vendor.addToPage(page, { x: 50, y: 700, width: 250, height: 18 })

  const item1 = form.createTextField('line_item_1')
  item1.setText('2 EA Copeland ZF15K compressor 845.00 1,690.00')
  item1.addToPage(page, { x: 50, y: 660, width: 400, height: 18 })

  const total = form.createTextField('quote_total')
  total.setText('1,690.00')
  total.addToPage(page, { x: 50, y: 620, width: 120, height: 18 })

  return Buffer.from(await doc.save())
}

async function makeDrawnTextPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Ordinary quote with drawn page text 123.45', { x: 50, y: 700, size: 12, font })
  return Buffer.from(await doc.save())
}

describe('extractPdfText', () => {
  it('reads AcroForm field values that carry no page text', async () => {
    const text = await extractPdfText(await makeFormOnlyPdf())
    expect(text).toContain('ACME Refrigeration Supply')
    expect(text).toContain('Copeland ZF15K compressor')
    // Comfortably past the 20-char "looks like a scan" threshold.
    expect(text.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(20)
  })

  it('still reads ordinary drawn page text', async () => {
    const text = await extractPdfText(await makeDrawnTextPdf())
    expect(text).toContain('Ordinary quote with drawn page text')
  })
})
