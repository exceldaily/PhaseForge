// One-time repair: assign projects with board_id NULL to their company's
// default board, mapping status -> board column (same logic as the
// 20260603_v2_board_architecture.sql back-fill).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const STATUS_TO_COLUMN = {
  queue: 'Queue',
  planning: 'Queue',
  on_hold: 'Queue',
  mobilization: 'Mobilization',
  construction_initiated: 'In Progress',
  pct_30: 'In Progress',
  pct_60: 'In Progress',
  pct_90: 'In Progress',
  active: 'In Progress',
  final_punchlist: 'Final Punchlist',
  closeout: 'Closeout',
  closed: 'Closed',
  completed: 'Closed',
  cancelled: 'Closed',
}

const PHASE_STATUS_TO_COLUMN = {
  not_started: 'Queue',
  in_progress: 'In Progress',
  blocked: 'In Progress',
  completed: 'Closed',
  skipped: 'Closed',
}

const { data: orphans, error: oErr } = await supabase
  .from('projects')
  .select('id, name, status, company_id')
  .is('board_id', null)
if (oErr) throw oErr
if (!orphans?.length) {
  console.log('No projects with board_id NULL — nothing to do.')
  process.exit(0)
}

const companyIds = [...new Set(orphans.map((p) => p.company_id))]

for (const companyId of companyIds) {
  const { data: board, error: bErr } = await supabase
    .from('boards')
    .select('id, name, board_columns(id, name, sort_order)')
    .eq('company_id', companyId)
    .eq('is_default', true)
    .limit(1)
    .single()
  if (bErr || !board) {
    console.log(`Company ${companyId}: no default board, skipping.`)
    continue
  }

  const columns = (board.board_columns ?? []).sort((a, b) => a.sort_order - b.sort_order)
  const byName = Object.fromEntries(columns.map((c) => [c.name.toLowerCase(), c.id]))
  const fallback = columns[0]?.id ?? null
  const columnFor = (map, status) => byName[(map[status] ?? '').toLowerCase()] ?? fallback

  const companyOrphans = orphans.filter((p) => p.company_id === companyId)
  console.log(`Company ${companyId}: assigning ${companyOrphans.length} project(s) to "${board.name}"`)

  for (const project of companyOrphans) {
    const columnId = columnFor(STATUS_TO_COLUMN, project.status)
    const { error } = await supabase
      .from('projects')
      .update({ board_id: board.id, board_column_id: columnId })
      .eq('id', project.id)
    console.log(`  ${error ? 'FAILED' : 'ok'}  ${project.name} (${project.status})${error ? ' — ' + error.message : ''}`)
    if (error) continue

    // Phase-level column mapping, only where not yet set
    const { data: phases } = await supabase
      .from('phases')
      .select('id, status')
      .eq('project_id', project.id)
      .is('board_column_id', null)
    for (const phase of phases ?? []) {
      await supabase
        .from('phases')
        .update({ board_column_id: columnFor(PHASE_STATUS_TO_COLUMN, phase.status) })
        .eq('id', phase.id)
    }
  }
}

console.log('Done.')
