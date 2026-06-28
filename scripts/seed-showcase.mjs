// One-off showcase seed: builds a Construction board with sample projects,
// phases, and punch items (real photos) on the exceldaily7 account so the
// marketing video has rich data. Re-runnable: deletes the prior showcase board
// (and its projects, which cascade) before recreating. Reads creds from .env.local.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── env ───────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('Missing Supabase env in .env.local')
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

const EMAIL = 'exceldaily7@gmail.com'
const BUCKET = 'project-attachments'
const BOARD_NAME = 'Showcase: Skyline Builders'

// ── photo helper (construction-themed, with fallbacks) ──────────────────────────
async function fetchPhoto(seed) {
  const sources = [
    `https://loremflickr.com/1200/800/construction,building,site?lock=${seed}`,
    `https://picsum.photos/seed/${seed}/1200/800`,
  ]
  for (const url of sources) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (res.ok) return Buffer.from(await res.arrayBuffer())
    } catch {}
  }
  // last resort: a tiny solid-gray JPEG so the item still renders
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwA//9k=',
    'base64'
  )
}
async function uploadPhoto(projectId, punchId, kind, seed) {
  const path = `punch-items/${projectId}/${punchId}/${kind}-photo-${Date.now()}.jpg`
  const body = await fetchPhoto(seed)
  const { error } = await db.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: true })
  if (error) { console.warn('  photo upload failed:', error.message); return null }
  return path
}

const day = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
const iso = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString()
}

async function main() {
  // ── who ──
  const { data: profile, error: pErr } = await db
    .from('profiles').select('id, company_id, full_name').eq('email', EMAIL).single()
  if (pErr || !profile) throw new Error(`Profile not found for ${EMAIL}: ${pErr?.message}`)
  const { id: uid, company_id: companyId } = profile
  console.log(`User ${profile.full_name || EMAIL} | company ${companyId}`)

  // ── clean prior showcase ──
  const { data: existing } = await db.from('boards').select('id').eq('company_id', companyId).eq('name', BOARD_NAME)
  for (const b of existing ?? []) {
    const { data: projs } = await db.from('projects').select('id').eq('board_id', b.id)
    for (const p of projs ?? []) await db.from('projects').delete().eq('id', p.id) // cascades phases + punch
    await db.from('boards').delete().eq('id', b.id)
    console.log('Removed previous showcase board')
  }

  // ── board (Construction template) ──
  const { data: board, error: bErr } = await db.from('boards').insert({
    company_id: companyId,
    name: BOARD_NAME,
    description: 'Sample data showcasing projects, Gantt phases, and punch lists.',
    color: '#6366f1',
    created_by: uid,
    is_private: false,
    sort_order: 50,
    visible_fields: ['client_name', 'job_location', 'project_manager', 'superintendent', 'subcontractors', 'priority', 'permit_status'],
    custom_stages: ['queue', 'mobilization', 'construction_initiated', 'pct_30', 'pct_60', 'pct_90', 'final_punchlist', 'closeout', 'closed'],
  }).select('id').single()
  if (bErr) throw bErr
  const boardId = board.id

  const COLS = [
    { name: 'Queue', color: '#94a3b8', sort_order: 0, is_done: false },
    { name: 'In Progress', color: '#6366f1', sort_order: 1, is_done: false },
    { name: 'Review', color: '#f59e0b', sort_order: 2, is_done: false },
    { name: 'Done', color: '#10b981', sort_order: 3, is_done: true },
  ]
  const { data: cols, error: cErr } = await db
    .from('board_columns').insert(COLS.map((c) => ({ ...c, board_id: boardId }))).select('id, name')
  if (cErr) throw cErr
  const colId = (name) => cols.find((c) => c.name === name).id
  console.log(`Board created: ${BOARD_NAME}`)

  // ── projects ──
  const projects = [
    {
      name: 'Riverside Apartments — Building A', customer_name: 'Riverside Living LLC',
      job_location: '1400 Riverwalk Dr, Austin, TX', status: 'pct_60', priority: 'high',
      column: 'In Progress', color: '#6366f1', superintendent: 'Marcus Reed', permit_status: 'approved',
      subcontractors: ['Apex Concrete', 'BrightVolt Electric', 'PureFlow Plumbing'], start: -120, end: 80,
      notes: '92-unit garden-style apartment complex. Currently in interior buildout on floors 2–4.',
      phases: [
        ['Site Mobilization', -120, -108, 'completed', 100, false],
        ['Foundations & Slab', -107, -78, 'completed', 100, false],
        ['Structural Framing', -77, -40, 'completed', 100, true],
        ['MEP Rough-In', -39, -5, 'in_progress', 70, false],
        ['Drywall & Interior Finishes', -4, 45, 'in_progress', 25, false],
        ['Landscaping & Sitework', 30, 70, 'not_started', 0, false],
        ['Final Punchlist & Turnover', 71, 80, 'not_started', 0, true],
      ],
      punch: [
        ['Cracked drywall at unit 204 stairwell', 'open', 'high', 'Drywall', 'Unit 204', null],
        ['HVAC vent not sealed in corridor', 'in_progress', 'medium', 'HVAC', 'Floor 3 corridor', null],
        ['Paint touch-up needed in lobby', 'completed', 'low', 'Paint', 'Main lobby', 'Repainted and color-matched; signed off by super.'],
      ],
    },
    {
      name: 'Downtown Office Retrofit', customer_name: 'Meridian Holdings',
      job_location: '88 Congress Ave, Suite 1200', status: 'mobilization', priority: 'medium',
      column: 'Queue', color: '#06b6d4', superintendent: 'Dana Whitfield', permit_status: 'pending',
      subcontractors: ['SteelCore Demolition', 'Lumen Lighting'], start: 5, end: 120,
      notes: 'Full 12th-floor tenant improvement: open ceilings, glass partitions, new café.',
      phases: [
        ['Permitting & Submittals', 5, 25, 'in_progress', 40, false],
        ['Selective Demolition', 26, 40, 'not_started', 0, false],
        ['Electrical & Data', 41, 75, 'not_started', 0, false],
        ['Glass Partitions & Millwork', 76, 105, 'not_started', 0, false],
        ['Commissioning', 106, 120, 'not_started', 0, true],
      ],
      punch: [],
    },
    {
      name: 'Lincoln Elementary Gymnasium', customer_name: 'Lincoln ISD',
      job_location: '500 School House Rd', status: 'pct_90', priority: 'high',
      column: 'Review', color: '#f59e0b', superintendent: 'Tom Alvarez', permit_status: 'approved',
      subcontractors: ['Summit Steel', 'GymPro Flooring', 'AcoustiCeil'], start: -200, end: 20,
      notes: 'New 12,000 sq ft gymnasium with bleachers and regulation court. Substantial completion near.',
      phases: [
        ['Earthwork & Foundations', -200, -160, 'completed', 100, false],
        ['Steel Erection', -159, -120, 'completed', 100, true],
        ['Roofing & Envelope', -119, -80, 'completed', 100, false],
        ['Court Flooring', -79, -40, 'completed', 100, false],
        ['Bleachers & Equipment', -39, -10, 'completed', 100, false],
        ['Final Inspections', -9, 20, 'in_progress', 60, true],
      ],
      punch: [
        ['Scuff marks on new court flooring', 'needs_review', 'medium', 'Flooring', 'Center court', null],
        ['Exit sign not illuminated — NE door', 'open', 'critical', 'Electrical', 'NE exit', null],
        ['Bleacher bolt torque verification', 'completed', 'high', 'Equipment', 'South bleachers', 'All bolts torqued to spec and tagged; inspector approved.'],
        ['Touch-up paint on door frames', 'completed', 'low', 'Paint', 'Main entry', 'Frames sanded and repainted.'],
      ],
    },
    {
      name: 'Harbor View Restaurant Buildout', customer_name: 'Saltline Hospitality',
      job_location: '2 Marina Way', status: 'closeout', priority: 'medium',
      column: 'Done', color: '#10b981', superintendent: 'Priya Nair', permit_status: 'approved',
      subcontractors: ['CoolTech Refrigeration', 'Tidewater Plumbing'], start: -160, end: -5,
      notes: 'Waterfront restaurant: commercial kitchen, 120-seat dining room, outdoor patio bar.',
      phases: [
        ['Demolition', -160, -150, 'completed', 100, false],
        ['Kitchen MEP', -149, -110, 'completed', 100, false],
        ['Dining Room Finishes', -109, -60, 'completed', 100, false],
        ['Patio & Bar', -59, -20, 'completed', 100, false],
        ['Health Dept Sign-off', -19, -5, 'completed', 100, true],
      ],
      punch: [
        ['Grease trap access cover loose', 'completed', 'high', 'Plumbing', 'Kitchen', 'Re-secured cover and gasket; passed inspection.'],
        ['Patio railing height check', 'completed', 'medium', 'Carpentry', 'Patio', 'Verified to code at 42"; documented.'],
      ],
    },
  ]

  for (const p of projects) {
    const { data: proj, error: prErr } = await db.from('projects').insert({
      company_id: companyId, name: p.name, customer_name: p.customer_name, job_location: p.job_location,
      start_date: day(p.start), end_date: day(p.end), project_manager: uid, superintendent: p.superintendent,
      subcontractors: p.subcontractors, permit_status: p.permit_status, status: p.status, priority: p.priority,
      notes: p.notes, color: p.color, tags: [], show_punch_on_card: true, is_archived: false,
      created_by: uid, board_id: boardId, board_column_id: colId(p.column),
    }).select('id').single()
    if (prErr) { console.error(`  project ${p.name} failed:`, prErr.message); continue }
    const projectId = proj.id

    const phaseRows = p.phases.map(([name, s, e, status, pct, milestone], i) => ({
      project_id: projectId, name, start_date: day(s), end_date: day(e), status,
      percent_complete: pct, is_milestone: milestone, sort_order: i, color: p.color, assigned_to: null,
    }))
    const { error: phErr } = await db.from('phases').insert(phaseRows)
    if (phErr) console.error(`  phases for ${p.name} failed:`, phErr.message)

    let n = 0
    for (const [desc, status, priority, category, location, completionDesc] of p.punch) {
      n += 1
      const punchId = crypto.randomUUID()
      const issuePath = await uploadPhoto(projectId, punchId, 'issue', `${projectId}-${n}-i`)
      if (!issuePath) continue
      const row = {
        id: punchId, project_id: projectId, company_id: companyId, number: n,
        issue_description: desc, issue_photo_path: issuePath, status, priority, category, location,
        created_by: uid, assigned_to: uid,
      }
      if (status === 'completed') {
        row.completion_photo_path = await uploadPhoto(projectId, punchId, 'completion', `${projectId}-${n}-c`)
        row.completion_description = completionDesc
        row.completed_by = uid
        row.completed_at = iso(-2)
      }
      const { error: puErr } = await db.from('punch_items').insert(row)
      if (puErr) console.error(`  punch #${n} for ${p.name} failed:`, puErr.message)
    }
    console.log(`  ✓ ${p.name} — ${p.phases.length} phases, ${p.punch.length} punch items`)
  }

  console.log('\nDone. Open the board "%s" in the app.', BOARD_NAME)
}

main().catch((e) => { console.error(e); process.exit(1) })
