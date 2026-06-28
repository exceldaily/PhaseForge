/**
 * POST /api/punch/import
 * Accepts one compressed image upload (multipart/form-data: projectId + image).
 * Uploads to Supabase storage and returns the path + signed URL.
 * Called per-item by PunchImportModal after client-side XLSX parsing.
 *
 * Also handles PDF upload (full file is OK for PDFs, which are typically small).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PUNCH_BUCKET = 'project-attachments'

export interface PunchImportUploadResult {
  issue_photo_path: string
  issue_photo_url: string
}

export interface PunchImportPdfResult {
  items: Array<{ description: string; location: null }>
}

// ── Image upload endpoint ────────────────────────────────────────────────────
// FormData: { projectId: string, image: File }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const projectId = formData.get('projectId') as string | null
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

  // Verify user belongs to the project's company.
  const [{ data: profile }, { data: project }] = await Promise.all([
    supabase.from('profiles').select('company_id').eq('id', user.id).single(),
    supabase.from('projects').select('company_id').eq('id', projectId).single(),
  ])
  if (!project || !profile?.company_id || profile.company_id !== project.company_id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = createAdminClient()

  // ── PDF mode: full file upload ────────────────────────────────────────────
  const pdfFile = formData.get('pdf') as File | null
  if (pdfFile) {
    const buffer = Buffer.from(await pdfFile.arrayBuffer())
    const items = await parsePdf(buffer)
    return NextResponse.json({ items } satisfies PunchImportPdfResult)
  }

  // ── Image upload mode ─────────────────────────────────────────────────────
  const image = formData.get('image') as File | null
  if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const ext = image.type === 'image/png' ? 'png' : 'jpg'
  const storagePath = `punch-items/${projectId}/import-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const imageBuffer = Buffer.from(await image.arrayBuffer())
  const { error: uploadError } = await admin.storage
    .from(PUNCH_BUCKET)
    .upload(storagePath, imageBuffer, { contentType: image.type || 'image/jpeg', upsert: false })

  if (uploadError) {
    console.error('[punch-import] upload failed', uploadError.message)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = await admin.storage
    .from(PUNCH_BUCKET)
    .createSignedUrl(storagePath, 3600)

  return NextResponse.json({
    issue_photo_path: storagePath,
    issue_photo_url: urlData?.signedUrl ?? '',
  } satisfies PunchImportUploadResult)
}

// ── PDF text parser ─────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer): Promise<Array<{ description: string; location: null }>> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const { text } = await pdfParse(buffer)
  const items: Array<{ description: string; location: null }> = []

  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
  let currentDesc: string[] = []
  let inItem = false

  const ITEM_START = /^#?\d{1,3}[.)]\s+(.+)/
  const SKIP_LINE = /^(Before Picture|After Picture|Status|Description of Work|Not Completed|Completed)/i

  const flush = () => {
    const desc = currentDesc.join(' ').trim()
    if (desc.length > 2) items.push({ description: desc, location: null })
    currentDesc = []
    inItem = false
  }

  for (const line of lines) {
    if (SKIP_LINE.test(line)) { if (inItem) flush(); continue }
    const m = ITEM_START.exec(line)
    if (m) { if (inItem) flush(); inItem = true; currentDesc = [m[1].trim()] }
    else if (inItem) { if (line.length < 3) flush(); else currentDesc.push(line) }
  }
  if (inItem) flush()

  return items
}
