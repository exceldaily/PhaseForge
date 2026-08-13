import 'server-only'

// PDF text extraction with damage tolerance, ported from InboxFlow. Modern
// pdf.js (pdfjs-dist legacy build) with stopAtErrors disabled recovers from
// malformed cross-reference tables ("bad XRef entry") and other real-world
// damage. Scanned-image PDFs come back empty — callers offer a paste fallback.
export async function extractPdfText(buf: Buffer): Promise<string> {
  return withPdfJs(buf)
}

/**
 * pdf.mjs references browser canvas globals (DOMMatrix / ImageData / Path2D)
 * at module-evaluation time. In the Vercel Node runtime (no @napi-rs/canvas)
 * that made the IMPORT itself throw "ReferenceError: DOMMatrix is not
 * defined", so every quote-form PDF failed with "Could not read that PDF".
 * Text extraction never touches these APIs — inert stubs are enough to let
 * the module load. Rendering still requires a real canvas (not used here).
 */
function stubCanvasGlobals() {
  const g = globalThis as Record<string, unknown>
  if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) {
          ;[this.a, this.b, this.c, this.d, this.e, this.f] = init
        }
      }
    }
  }
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = class ImageData {
      width: number; height: number; data: Uint8ClampedArray
      constructor(w: number, h: number) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4) }
    }
  }
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = class Path2D { addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} closePath() {} rect() {} }
  }
}

async function withPdfJs(buf: Buffer): Promise<string> {
  stubCanvasGlobals()
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
