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
