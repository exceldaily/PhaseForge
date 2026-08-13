'use client'

// Client-side PDF helpers for the Plans module, built on the pdfjs-dist
// dependency the app already uses (worker at /pdf.worker.mjs).

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

export async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
      return m
    })
  }
  return pdfjsPromise
}

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs()
  // Copy the buffer: pdfjs transfers it to the worker, and callers often need
  // the original bytes again (e.g. pdf-lib splitting after detection).
  return pdfjs.getDocument({ data: data.slice(0) }).promise
}

export interface PageText {
  full: string
  /** Text items with normalized positions (0..1, PDF origin bottom-left → we flip to top-left). */
  items: { str: string; x: number; y: number; w: number; h: number }[]
  width: number
  height: number
}

export async function extractPageText(page: PDFPageProxy): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const items: PageText['items'] = []
  const parts: string[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const t = item.transform
    items.push({
      str: item.str,
      x: t[4] / viewport.width,
      y: 1 - t[5] / viewport.height, // top-left origin
      w: (item.width ?? 0) / viewport.width,
      h: (item.height ?? 0) / viewport.height,
    })
    parts.push(item.str)
  }
  return { full: parts.join(' ').replace(/\s+/g, ' ').trim(), items, width: viewport.width, height: viewport.height }
}

/**
 * Render a page to a canvas at a target CSS pixel width, honoring
 * devicePixelRatio for crispness. Returns the canvas (backing store scaled).
 */
export async function renderPageToCanvas(
  page: PDFPageProxy,
  targetWidth: number,
  opts: { rotation?: number; dpr?: number; maxPixels?: number } = {},
): Promise<HTMLCanvasElement> {
  const dpr = opts.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const rotation = ((page.rotate + (opts.rotation ?? 0)) % 360 + 360) % 360
  const base = page.getViewport({ scale: 1, rotation })
  let scale = (targetWidth * dpr) / base.width
  // Mobile-safety: cap the backing store so huge sheets can't blow out memory.
  const maxPixels = opts.maxPixels ?? 16_000_000
  const projected = base.width * scale * base.height * scale
  if (projected > maxPixels) scale *= Math.sqrt(maxPixels / projected)
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { alpha: false })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas
}

/** Render a webp thumbnail blob for a page (grid/list/navigator previews). */
export async function renderThumbnail(page: PDFPageProxy, width = 480): Promise<Blob> {
  const canvas = await renderPageToCanvas(page, width, { dpr: 1 })
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Thumbnail generation failed'))),
      'image/webp',
      0.82,
    )
  })
}

/**
 * High-resolution JPEG render of a page — the fallback when lossless page
 * extraction produces an oversized file (scanned sets and PDFs with shared
 * resource trees can make ONE extracted page nearly as big as the whole
 * document). ~200 DPI on an ARCH D sheet, capped for mobile-safe memory.
 */
export async function renderPageToJpeg(page: PDFPageProxy, quality = 0.82): Promise<Blob> {
  const base = page.getViewport({ scale: 1 })
  // Aim for 200 DPI (PDF points are 1/72"): scale ≈ 200/72 ≈ 2.78
  const targetWidth = (base.width * 200) / 72
  const canvas = await renderPageToCanvas(page, targetWidth, { dpr: 1, maxPixels: 24_000_000 })
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Page render failed'))),
      'image/jpeg',
      quality,
    )
  })
}
