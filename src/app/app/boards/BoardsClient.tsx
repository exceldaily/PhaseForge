'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Settings, Layers, Lock, ChevronRight } from 'lucide-react'
import { createBoard } from './actions'
import { BoardFieldCustomizer } from '@/components/boards/BoardFieldCustomizer'
import { Board, BoardColumn } from '@/types/app'
import { cn } from '@/lib/utils'

type BoardWithMeta = Board & {
  board_columns: BoardColumn[]
  board_teams: { team_id: string }[]
}

interface Team { id: string; name: string; color: string }

interface UsageSummary {
  plan: string
  planLabel: string
  boards: { current: number; limit: number; unlimited: boolean }
}

interface BoardsClientProps {
  boards: BoardWithMeta[]
  teams: Team[]
  projectCountMap: Record<string, number>
  usage: UsageSummary
  canEdit: boolean
  canAdmin: boolean
  companyId: string
}

const BOARD_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899',
]

export function BoardsClient({ boards, teams, projectCountMap, usage, canEdit, canAdmin, companyId }: BoardsClientProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(BOARD_COLORS[0])
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customizingFields, setCustomizingFields] = useState(false)
  const [visibleFields, setVisibleFields] = useState<string[]>([])
  const [customStages, setCustomStages] = useState<string[]>([])

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const atLimit = !usage.boards.unlimited && usage.boards.current >= usage.boards.limit

  const handleCustomizationSave = (fields: string[], stages: string[]) => {
    setVisibleFields(fields)
    setCustomStages(stages)
    setCustomizingFields(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    const fd = new FormData()
    fd.set('name', newName.trim())
    fd.set('color', newColor)
    fd.set('description', newDesc.trim())
    fd.set('visibleFields', JSON.stringify(visibleFields))
    fd.set('customStages', JSON.stringify(customStages))
    const result = await createBoard(fd)
    setSaving(false)
    if (!result.success) { setError(result.error ?? 'Failed'); return }
    setCreating(false)
    setNewName(''); setNewDesc(''); setNewColor(BOARD_COLORS[0])
    setVisibleFields([])
    setCustomStages([])
    window.location.href = `/app/boards/${result.boardId}`
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Boards</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Project workspaces with custom columns and team visibility.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Usage pill */}
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{usage.boards.current}</span>
            {!usage.boards.unlimited && <span className="text-slate-400"> / {usage.boards.limit}</span>}
            {' '}board{usage.boards.current !== 1 ? 's' : ''}
            <span className="ml-1.5 capitalize text-slate-400">· {usage.planLabel}</span>
          </div>

          {canEdit && (
            <button
              onClick={() => atLimit ? undefined : setCreating(true)}
              disabled={atLimit}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                atLimit
                  ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              )}
              title={atLimit ? `Upgrade to create more boards (${usage.planLabel} plan)` : undefined}
            >
              {atLimit ? <Lock size={14} /> : <Plus size={14} />}
              New Board
            </button>
          )}
        </div>
      </div>

      {/* Upgrade banner */}
      {atLimit && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Board limit reached.</span> Your {usage.planLabel} plan includes {usage.boards.limit} board{usage.boards.limit !== 1 ? 's' : ''}.
          </p>
          <Link href="/app/settings/billing"
            className="flex-shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
            Upgrade Plan
          </Link>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Create New Board</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Board Name *</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Construction Board, Service Board"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                <input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Optional description"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500">Color:</span>
              {BOARD_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={cn('h-6 w-6 rounded-full border-2 transition-all', newColor === c ? 'border-slate-900 scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>

          {/* Field Customizer */}
          <BoardFieldCustomizer onSave={handleCustomizationSave} />

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim() || visibleFields.length === 0 || customStages.length === 0}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Board'}
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setNewName('')
                setError('')
                setVisibleFields([])
                setCustomStages([])
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Board grid */}
      {boards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white py-24 text-center">
          <Layers size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-lg font-semibold text-slate-600">No boards yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm">
            Boards are your project workspaces. Each board has custom columns and can be assigned to specific teams.
          </p>
          {canEdit && (
            <button onClick={() => setCreating(true)}
              className="mt-6 flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              <Plus size={14} /> Create First Board
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map(board => {
            const projectCount = projectCountMap[board.id] ?? 0
            const teamIds = board.board_teams.map(bt => bt.team_id)
            const boardTeams = teamIds.map(id => teamMap[id]).filter(Boolean)
            const cols = board.board_columns.sort((a, b) => a.sort_order - b.sort_order)

            return (
              <Link key={board.id} href={`/app/boards/${board.id}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all">
                {/* Color bar */}
                <div className="h-1.5 w-full" style={{ backgroundColor: board.color }} />

                <div className="flex-1 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">
                        {board.name}
                        {board.is_default && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">Default</span>
                        )}
                      </h2>
                      {board.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{board.description}</p>
                      )}
                    </div>
                    {canAdmin && (
                      <Link href={`/app/boards/${board.id}/settings`}
                        onClick={e => e.stopPropagation()}
                        className="ml-2 flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Settings size={15} />
                      </Link>
                    )}
                  </div>

                  {/* Column pills */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {cols.slice(0, 5).map(col => (
                      <span key={col.id}
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: col.color }}>
                        {col.name}
                      </span>
                    ))}
                    {cols.length > 5 && (
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-400">
                        +{cols.length - 5}
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span><strong className="text-slate-900">{projectCount}</strong> project{projectCount !== 1 ? 's' : ''}</span>
                    <span><strong className="text-slate-900">{cols.length}</strong> columns</span>
                  </div>

                  {/* Teams */}
                  {boardTeams.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {boardTeams.map(t => (
                        <span key={t.id}
                          className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                          style={{ borderColor: t.color + '66', color: t.color }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {boardTeams.length === 0 && (
                    <p className="mt-3 text-[10px] text-slate-400">Visible to all members</p>
                  )}
                </div>

                <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-indigo-600">Open Board</span>
                  <ChevronRight size={14} className="text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
