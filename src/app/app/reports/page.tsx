import Link from 'next/link'
import { FileText, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BOARD_FILTER_NONE, BoardOption, resolveBoardFilter } from '@/lib/boardFilter'
import { getStoredBoardFilter } from '@/lib/boardFilter.server'
import { canUsePrintAndReports } from '@/lib/constants'
import { Project } from '@/types/app'
import { ReportsClient } from './ReportsClient'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const { data: company } = await supabase
    .from('companies')
    .select('plan')
    .eq('id', profile.company_id)
    .single()

  if (!canUsePrintAndReports(company?.plan)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-24 text-center">
        <span className="mb-5 inline-flex rounded-2xl bg-indigo-50 p-4 text-indigo-600">
          <FileText size={28} />
        </span>
        <h1 className="text-2xl font-bold text-slate-900">Reports are a Pro feature</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Filterable reports, CSV export, and printing are available on the Pro and Business
          plans. Upgrade your workspace to generate and share reports.
        </p>
        <Link
          href="/app/billing"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <Lock size={15} /> View upgrade options
        </Link>
      </div>
    )
  }

  const { data: boardsData } = await supabase
    .from('boards')
    .select('id, name, color')
    .eq('company_id', profile.company_id)
    .order('sort_order', { ascending: true })
    .order('name')
  const boards = (boardsData ?? []) as BoardOption[]
  const storedBoardFilter = await getStoredBoardFilter()
  const boardFilter = resolveBoardFilter(params.board, boards, storedBoardFilter)

  let projectsQuery = supabase
    .from('projects')
    .select('*, phases(*)')
    .eq('company_id', profile.company_id)
    .order('start_date', { ascending: true })
  if (boardFilter === BOARD_FILTER_NONE) {
    projectsQuery = projectsQuery.is('board_id', null)
  } else if (boardFilter) {
    projectsQuery = projectsQuery.eq('board_id', boardFilter)
  }

  const [projectsRes, membersRes] = await Promise.all([
    projectsQuery,
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('is_active', true),
  ])

  return (
    <ReportsClient
      projects={(projectsRes.data ?? []) as Project[]}
      members={membersRes.data ?? []}
      boards={boards}
      selectedBoardId={boardFilter}
    />
  )
}
