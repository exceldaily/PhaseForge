/**
 * Browser-side XLSX punch list parser.
 * Uses JSZip to read the file as a ZIP directly — no server upload needed,
 * so files up to hundreds of MB work without hitting Vercel's 4.5MB limit.
 */

export interface ParsedXlsxRow {
  description: string
  location: string | null
  scope: string | null          // raw value from col A ('Y', 'N', etc.)
  imageBlob: Blob | null        // raw image from the XLSX
  imagePreviewUrl: string | null // object URL for <img> preview (revoke when done)
}

export async function parseXlsxClient(file: File): Promise<ParsedXlsxRow[]> {
  // Dynamic import keeps jszip out of the initial server bundle
  const JSZip = (await import('jszip')).default

  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)

  // ── Shared strings ────────────────────────────────────────────────────────
  const ssFile = zip.file('xl/sharedStrings.xml')
  const strings: string[] = []
  if (ssFile) {
    const ssXml = await ssFile.async('string')
    const siRe = /<si[^>]*>([\s\S]*?)<\/si>/g
    let m: RegExpExecArray | null
    while ((m = siRe.exec(ssXml)) !== null) {
      const tRe = /<t[^>]*>([^<]*)<\/t>/g
      let t: RegExpExecArray | null
      let val = ''
      while ((t = tRe.exec(m[1])) !== null) val += t[1]
      strings.push(val)
    }
  }

  // ── Find the first sheet that has row data ───────────────────────────────
  // Note: worksheet XMLs use shared-string indices (e.g. <v>1</v>), NOT raw text,
  // so we can't search for "Item Description" inside the worksheet XML.
  // Just pick the first sheet that contains any <row> elements.
  let wsXml = ''
  let drawingPath = ''
  const worksheetFiles = Object.keys(zip.files)
    .filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)![0])
      const nb = parseInt(b.match(/\d+/)![0])
      return na - nb
    })

  for (const wsPath of worksheetFiles) {
    const candidate = zip.file(wsPath)
    if (!candidate) continue
    const xml = await candidate.async('string')
    if (!/<row r=/.test(xml)) continue  // empty sheet, skip
    wsXml = xml
    // Find corresponding drawing via the sheet's .rels file
    const relsPath = wsPath.replace('xl/worksheets/', 'xl/worksheets/_rels/') + '.rels'
    const relFile = zip.file(relsPath)
    if (relFile) {
      const relsXml = await relFile.async('string')
      const drMatch = /Target="\.\.\/drawings\/(drawing\d+\.xml)"/.exec(relsXml)
      if (drMatch) drawingPath = `xl/drawings/${drMatch[1]}`
    }
    break
  }
  if (!wsXml) return []

  // ── Parse rows ────────────────────────────────────────────────────────────
  interface RowData { A?: string; B?: string; C?: string }
  const rowData: Record<number, RowData> = {}
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(wsXml)) !== null) {
    const rn = parseInt(rm[1])
    const cells: RowData = {}
    const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(rm[2])) !== null) {
      const col = cm[1] as 'A' | 'B' | 'C'
      if (!['A', 'B', 'C'].includes(col)) continue
      const isStr = cm[2].includes('t="s"')
      const vMatch = /<v>([^<]*)<\/v>/.exec(cm[3])
      if (vMatch) {
        cells[col] = isStr ? (strings[parseInt(vMatch[1])] ?? '') : vMatch[1]
      }
    }
    rowData[rn] = cells
  }

  // Detect header row (first row with "Item Description" or "Description" in col B/A)
  let headerRow = -1
  for (const [rn, cells] of Object.entries(rowData)) {
    const b = cells.B?.toLowerCase() ?? ''
    const a = cells.A?.toLowerCase() ?? ''
    if (b.includes('description') || a.includes('description')) {
      headerRow = parseInt(rn)
      break
    }
  }
  if (headerRow < 0) headerRow = 2 // fallback

  // ── Parse drawing for image-to-row mapping ────────────────────────────────
  const imageNameByRow: Record<number, string> = {}
  if (drawingPath) {
    const drawFile = zip.file(drawingPath)
    if (drawFile) {
      const drawXml = await drawFile.async('string')
      const anchorRe = /<xdr:oneCellAnchor>([\s\S]*?)<\/xdr:oneCellAnchor>/g
      let am: RegExpExecArray | null
      const seenRows = new Set<number>()
      while ((am = anchorRe.exec(drawXml)) !== null) {
        const rowM = /<xdr:row>(\d+)<\/xdr:row>/.exec(am[1])
        const nameM = /<xdr:cNvPr[^>]*name="([^"]+)"/.exec(am[1])
        if (rowM && nameM) {
          const excelRow = parseInt(rowM[1]) + 1 // xdr:row is 0-indexed
          if (!seenRows.has(excelRow)) {          // first image per row wins
            seenRows.add(excelRow)
            imageNameByRow[excelRow] = nameM[1]   // e.g. "image4.png"
          }
        }
      }
    }
  }

  // ── Extract image blobs from zip media ────────────────────────────────────
  const imageCache: Record<string, Blob> = {}
  const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('xl/media/'))
  for (const path of mediaFiles) {
    const name = path.split('/').pop() ?? ''
    const buf = await zip.file(path)!.async('arraybuffer')
    const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg'
    imageCache[name] = new Blob([buf], { type: mime })
  }

  // ── Build result rows ─────────────────────────────────────────────────────
  const items: ParsedXlsxRow[] = []
  const rowNumbers = Object.keys(rowData).map(Number).sort((a, b) => a - b)

  for (const rn of rowNumbers) {
    if (rn <= headerRow) continue  // skip header and anything above it
    const cells = rowData[rn]
    const description = cells.B?.trim() || cells.A?.trim() || ''
    if (!description) continue

    const scope = cells.A?.trim() || null
    const location = cells.C?.trim() || null

    let imageBlob: Blob | null = null
    let imagePreviewUrl: string | null = null
    const imgName = imageNameByRow[rn]
    if (imgName && imageCache[imgName]) {
      imageBlob = imageCache[imgName]
      imagePreviewUrl = URL.createObjectURL(imageBlob)
    }

    items.push({ description, location, scope, imageBlob, imagePreviewUrl })
  }

  return items
}

// ── PDF punch import WITH embedded photos (browser-side) ────────────────────
// Many punch PDFs (e.g. EMJ/Walmart exports) place 1–2 photos in each issue's
// row. We read the text for descriptions AND pull the embedded images, mapping
// each image to the issue directly above it by vertical position. Two photos
// for one issue are stitched side-by-side into a single image, which fits the
// one-issue-photo model and still shows both.

export interface ParsedPdfPunchItem {
  description: string
  location: string | null
  imageBlob: Blob | null
  imagePreviewUrl: string | null
}

interface ImgBox { id: string; y: number; w: number; h: number }

export async function parsePunchPdfClient(file: File): Promise<ParsedPdfPunchItem[]> {
  const { getPdfjs, loadPdf } = await import('@/lib/plans/pdf')
  const pdfjs = await getPdfjs()
  const OPS = (pdfjs as unknown as { OPS: Record<string, number> }).OPS
  const { parsePunchPdfText } = await import('@/lib/punchPdf')

  const buf = await file.arrayBuffer()
  const doc = await loadPdf(buf)

  type PageItem = { description: string; anchorY: number; photos: Blob[] }
  const allItems: PageItem[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()

    // 1. Item anchors: parse THIS page's text, then find each description's
    //    first line to get its Y position (PDF bottom-left origin).
    const lineY = new Map<string, number>()
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const key = it.str.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 24)
      if (!lineY.has(key)) lineY.set(key, it.transform[5])
    }
    const pageText = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('')
    const parsed = parsePunchPdfText(pageText)
    const pageItems: PageItem[] = parsed.map((it) => {
      const key = it.description.toLowerCase().replace(/\s+/g, ' ').slice(0, 24)
      return { description: it.description, anchorY: lineY.get(key) ?? 0, photos: [] }
    })

    // 2. Image boxes with positions (track the CTM through the op list).
    const ops = await page.getOperatorList()
    let ctm = [1, 0, 0, 1, 0, 0]
    const stack: number[][] = []
    const mul = (m: number[], n: number[]) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ]
    const boxes: ImgBox[] = []
    for (let k = 0; k < ops.fnArray.length; k++) {
      const fn = ops.fnArray[k]
      const a = ops.argsArray[k] as unknown[]
      if (fn === OPS.save) stack.push(ctm.slice())
      else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
      else if (fn === OPS.transform) ctm = mul(ctm, a as number[])
      else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
        const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3])
        if (w >= 60 && h >= 60) boxes.push({ id: a[0] as string, y: ctm[5], w, h })
      }
    }

    // 3. Assign each image to the issue whose anchor sits just ABOVE it.
    if (pageItems.length > 0) {
      for (const box of boxes) {
        let best: PageItem | null = null
        for (const item of pageItems) {
          if (item.anchorY >= box.y && (!best || item.anchorY < best.anchorY)) best = item
        }
        const target = best ?? pageItems[pageItems.length - 1]
        const blob = await imageBlobFromPage(page, box.id)
        if (blob) target.photos.push(blob)
      }
    }
    allItems.push(...pageItems)
    page.cleanup()
  }
  await doc.loadingTask.destroy()

  // 4. Build results: stitch 1–2 photos into one issue image.
  const out: ParsedPdfPunchItem[] = []
  for (const it of allItems) {
    let imageBlob: Blob | null = null
    if (it.photos.length === 1) imageBlob = it.photos[0]
    else if (it.photos.length >= 2) imageBlob = await stitchSideBySide(it.photos.slice(0, 2))
    out.push({
      description: it.description,
      location: null,
      imageBlob,
      imagePreviewUrl: imageBlob ? URL.createObjectURL(imageBlob) : null,
    })
  }
  return out
}

/** Resolve a pdfjs image XObject to a JPEG blob via canvas. */
async function imageBlobFromPage(page: import('pdfjs-dist').PDFPageProxy, id: string): Promise<Blob | null> {
  try {
    const objs = (page as unknown as { objs: { get: (id: string, cb?: (o: unknown) => void) => unknown; has?: (id: string) => boolean } }).objs
    const obj = await new Promise<{ width: number; height: number; data?: Uint8ClampedArray | Uint8Array; bitmap?: CanvasImageSource } | null>((resolve) => {
      try {
        if (objs.has && objs.has(id)) { resolve(objs.get(id) as never); return }
        objs.get(id, (o: unknown) => resolve(o as never))
      } catch { resolve(null) }
    })
    if (!obj) return null
    const canvas = document.createElement('canvas')
    canvas.width = obj.width
    canvas.height = obj.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (obj.bitmap) {
      ctx.drawImage(obj.bitmap, 0, 0)
    } else if (obj.data) {
      const src = obj.data
      const px = obj.width * obj.height
      const rgba = new Uint8ClampedArray(px * 4)
      if (src.length === px * 4) rgba.set(src)
      else if (src.length === px * 3) {
        for (let i = 0, j = 0; i < px; i++) { rgba[j++] = src[i * 3]; rgba[j++] = src[i * 3 + 1]; rgba[j++] = src[i * 3 + 2]; rgba[j++] = 255 }
      } else return null
      ctx.putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0)
    } else return null
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85))
  } catch {
    return null
  }
}

/** Combine up to two images into one JPEG, side by side at equal height. */
async function stitchSideBySide(blobs: Blob[]): Promise<Blob | null> {
  const imgs = await Promise.all(blobs.map((b) => new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image(); const u = URL.createObjectURL(b)
    im.onload = () => { URL.revokeObjectURL(u); res(im) }
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img load')) }
    im.src = u
  })))
  const H = Math.min(...imgs.map((i) => i.height), 900)
  const widths = imgs.map((i) => Math.round(i.width * (H / i.height)))
  const gap = 6
  const canvas = document.createElement('canvas')
  canvas.width = widths.reduce((a, b) => a + b, 0) + gap * (imgs.length - 1)
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return blobs[0]
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  let x = 0
  imgs.forEach((im, i) => { ctx.drawImage(im, x, 0, widths[i], H); x += widths[i] + gap })
  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85))
}

/** Compress an image Blob to JPEG using canvas (runs in browser only). */
export async function compressImage(blob: Blob, maxPx = 1400, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(blob); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        b => { if (b) resolve(b); else reject(new Error('Canvas toBlob failed')) },
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}
