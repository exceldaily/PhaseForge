// Read-only diagnostic: where do projects' board_id values point?
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: boards, error: bErr } = await supabase
  .from('boards')
  .select('id, name, is_default, company_id')
if (bErr) throw bErr

const { data: projects, error: pErr } = await supabase
  .from('projects')
  .select('id, name, board_id, board_column_id, is_archived, created_at, updated_at')
  .order('created_at')
if (pErr) throw pErr

const boardName = Object.fromEntries(boards.map((b) => [b.id, b.name]))

console.log('--- Boards ---')
for (const b of boards) console.log(`${b.id}  ${b.name}${b.is_default ? ' (default)' : ''}`)

console.log('\n--- Projects ---')
for (const p of projects) {
  console.log(
    `${p.name.padEnd(32)} board=${p.board_id ? boardName[p.board_id] ?? p.board_id : 'NULL'}  column=${p.board_column_id ? 'set' : 'NULL'}  archived=${p.is_archived}  created=${p.created_at?.slice(0, 10)}  updated=${p.updated_at?.slice(0, 10)}`
  )
}

const counts = {}
for (const p of projects.filter((p) => !p.is_archived)) {
  const key = p.board_id ? boardName[p.board_id] ?? p.board_id : 'NULL'
  counts[key] = (counts[key] ?? 0) + 1
}
console.log('\n--- Active project counts by board ---')
console.log(counts)
