'use client'
import { useDeferredValue, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, LayoutGrid, Kanban, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { BoardFilter } from '@/components/boards/BoardFilter'
import { KanbanBoard } from '@/components/projects/KanbanBoard'
import { BoardColumnsKanban } from '../boards/[id]/BoardKanban'
import { ImportButton } from './ImportButton'
import { BoardOption } from '@/lib/boardFilter'
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/dates'
import { getProjectLastUpdatedLabel } from '@/lib/projectAudit'
import { BoardColumn, Project, ProjectStatus, ProjectPriority, Profile } from '@/types/app'
import { cn } from '@/lib/utils'

type ViewMode = 'grid' | 'kanban'

interface ProjectsClientProps {
  projects: Project[]
  companyId: string
  currentUserId: string
  canEdit: boolean
  members: Pick<Profile, 'id' | 'full_name'>[]
  boards: BoardOption[]
  selectedBoardId: string | null
  selectedBoardColumns?: BoardColumn[] | null
}

export function ProjectsClient({ projects, companyId, currentUserId, canEdit, members, boards, selectedBoardId, selectedBoardColumns }: ProjectsClientProps) {
  const [view, setView] = useState<ViewMode>('kanban')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const deferredSearch = useDeferredValue(search)

  const memberMap = Object.fromEntries(members.map(m => [m.id, m.full_name]))

  const filtered = projects.filter(p => {
    const q = deferredSearch.toLowerCase().trim()
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.customer_name?.toLowerCase().includes(q)) ||
      (p.job_location?.toLowerCase().includes(q))
    const matchesStatus = !statusFilter || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className={cn('p-6 space-y-5', view === 'kanban' ? 'max-w-none' : 'max-w-7xl mx-auto')}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 mt-0.5 text-sm">{filtered.length} of {projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportButton companyId={companyId} currentUserId={currentUserId} />
          <Link href="/app/projects/new">
            <Button><Plus size={16} /> New Project</Button>
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by project name, client, location..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        <BoardFilter boards={boards} selectedBoardId={selectedBoardId} />

        {view === 'grid' && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All statuses</option>
            <option value="queue">Queue</option>
            <option value="mobilization">Mobilization</option>
            <option value="construction_initiated">Construction Initiated</option>
            <option value="pct_30">30% Constructed</option>
            <option value="pct_60">60% Constructed</option>
            <option value="pct_90">90% Constructed</option>
            <option value="final_punchlist">Final Punchlist</option>
            <option value="closeout">Closeout</option>
            <option value="closed">Closed</option>
          </select>
        )}

        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 ml-auto">
          <button onClick={() => setView('kanban')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              view === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <Kanban size={14} /> Board
          </button>
          <button onClick={() => setView('grid')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              view === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <LayoutGrid size={14} /> Grid
          </button>
        </div>
      </div>

      {/* Kanban board — full width, horizontal scroll.
          With a single board selected, show that board's own columns. */}
      {view === 'kanban' && (
        selectedBoardId && selectedBoardColumns && selectedBoardColumns.length > 0 ? (
          <div className="relative">
            <BoardColumnsKanban
              boardId={selectedBoardId}
              columns={selectedBoardColumns}
              projects={filtered}
              memberMap={memberMap}
              canEdit={canEdit}
            />
          </div>
        ) : (
          <KanbanBoard
            projects={projects}
            canEdit={canEdit}
            searchQuery={search}
            companyId={companyId}
            currentUserId={currentUserId}
            memberMap={memberMap}
          />
        )
      )}

      {/* Grid view */}
      {view === 'grid' && (
        filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
            <p className="text-slate-400 mb-4">No projects found</p>
            <Link href="/app/projects/new"><Button><Plus size={16} />Create your first project</Button></Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(project => (
              <Link key={project.id} href={`/app/projects/${project.id}`}>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="text-xs text-slate-400 font-medium">{project.customer_name || 'No client'}</span>
                    </div>
                    <Badge className={PRIORITY_COLORS[project.priority as ProjectPriority]}>
                      {PRIORITY_LABELS[project.priority as ProjectPriority]}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors mb-1">{project.name}</h3>
                  {project.job_location && <p className="text-xs text-slate-400 mb-3">{project.job_location}</p>}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <Badge className={PROJECT_STATUS_COLORS[project.status as ProjectStatus] ?? 'bg-slate-100 text-slate-700'}>
                      {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
                    </Badge>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Due</p>
                      <p className="text-xs font-medium text-slate-700">{formatDate(project.end_date)}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-[11px] leading-4 text-slate-500">
                    {getProjectLastUpdatedLabel(project, memberMap)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  )
}
