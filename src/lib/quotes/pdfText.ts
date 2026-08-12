import 'server-only'

// PDF text extraction with damage tolerance, ported from InboxFlow. Modern
// pdf.js (pdfjs-dist legacy build) with stopAtErrors disabled recovers from
// malformed cross-reference tables ("bad XRef entry") and other real-world
// damage. Scanned-image PDFs come back empty — callers offer a paste fallback.
export async function extractPdfText(buf: Buffer): Promise<string> {
  return withPdfJs(buf)
}

async function withPdfJs(buf: Buffer): Promise<string> {
  // pdf.js resolves its worker (pdf.worker.mjs) relative to its own module.
  // next.config outputFileTracingIncludes force-includes that file into the
  // Vercel function bundle so the default resolution succeeds in the lambda.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: new Uint8Array(buf),
    stopAtErrors: false, // keep going through damaged xref tables
    disableFontFace: true,
    verbosity: 0,
  })
  try {
    const doc = await task.promise
    let out = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      // Preserve line structure: pdf.js marks end-of-line items with hasEOL.
      // Line-based consumers (punch import) need real newlines; whitespace-
      // collapsing consumers (quote form parser) are unaffected.
      let pageText = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        pageText += item.str
        pageText += item.hasEOL ? '\n' : ' '
      }
      out += pageText + '\n'
    }
    return out
  } finally {
    await task.destroy()
  }
}
