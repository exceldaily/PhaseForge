'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, GripVertical, Check, X, Save, Lock, Globe } from 'lucide-react'
import {
  addBoardColumn, updateBoardColumn, deleteBoardColumn,
  reorderBoardColumns, updateBoard, deleteBoard, addBoardTeam, removeBoardTeam,
} from '../../actions'
import { Board, BoardColumn } from '@/types/app'
import { BOARD_COLUMN_MIN, BOARD_COLUMN_MAX } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface Team { id: string; name: string; color: string }

interface BoardSettingsClientProps {
  board: Board
  columns: BoardColumn[]
  teams: Team[]
  assignedTeamIds: string[]
  canAdmin: boolean
}

const COLORS = [
  '#94a3b8','#6366f1','#8b5cf6','#06b6d4','#10b981',
  '#f59e0b','#f43f5e','#3b82f6','#ec4899','#14b8a6',
]

export function BoardSettingsClient({ board, columns: initialColumns, teams, assignedTeamIds: initialAssigned, canAdmin }: BoardSettingsClientProps) {
  const router = useRouter()
  const [columns, setColumns] = useState(initialColumns)
  const [assignedTeamIds, setAssignedTeamIds] = useState(new Set(initialAssigned))
  const [isPrivate, setIsPrivate] = useState(board.is_private)
  const [boardName, setBoardName] = useState(board.name)
  const [boardColor, setBoardColor] = useState(board.color)
  const [boardDesc, setBoardDesc] = useState(board.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New column form
  const [newColName, setNewColName] = useState('')
  const [newColColor, setNewColColor] = useState('#94a3b8')
  const [addingCol, setAddingCol] = useState(false)

  // Inline editing
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [editColName, setEditColName] = useState('')
  const [editColColor, setEditColColor] = useState('')
  const [editColDone, setEditColDone] = useState(false)

  // Drag state for column reorder
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  // ── Board details save ────────────────────────────────────────────────────
  const saveBoardDetails = async () => {
    setSaving(true); setError('')
    const result = await updateBoard(board.id, { name: boardName.trim(), description: boardDesc.trim() || undefined, color: boardColor })
    setSaving(false)
    if (!result.success) { setError(result.error ?? 'Failed'); return }
    flash('Board updated')
  }

  // ── Column add ────────────────────────────────────────────────────────────
  const handleAddColumn = async () => {
    if (!newColName.trim()) return
    if (columns.length >= BOARD_COLUMN_MAX) { setError(`Maximum ${BOARD_COLUMN_MAX} columns reached`); return }
    setError('')
    const result = await addBoardColumn(board.id, { name: newColName.trim(), color: newColColor })
    if (!result.success) { setError(result.error ?? 'Failed'); return }
    setColumns(prev => [...prev, result.column!])
    setNewColName(''); setAddingCol(false)
    flash('Column added')
  }

  // ── Column delete ─────────────────────────────────────────────────────────
  const handleDeleteColumn = async (col: BoardColumn) => {
    if (columns.length <= BOARD_COLUMN_MIN) { setError(`Minimum ${BOARD_COLUMN_MIN} columns required`); return }
    if (!confirm(`Delete "${col.name}"? Projects in this column will move to the first column.`)) return
    const result = await deleteBoardColumn(col.id, board.id)
    if (!result.success) { setError(result.error ?? 'Failed'); return }
    setColumns(prev => prev.filter(c => c.id !== col.id))
    flash('Column deleted')
  }

  // ── Column inline edit save ───────────────────────────────────────────────
  const saveColEdit = async (colId: string) => {
    const result = await updateBoardColumn(colId, { name: editColName.trim(), color: editColColor, is_done: editColDone })
    if (!result.success) { setError(result.error ?? 'Failed'); return }
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, name: editColName, color: editColColor, is_done: editColDone } : c))
    setEditingColId(null)
    flash('Column saved')
  }

  // ── Drag reorder ──────────────────────────────────────────────────────────
  const handleDrop = async (targetId: string) => {
    if (!draggingId || draggingId === targetId) { setDragOver(null); setDraggingId(null); return }
    const from = columns.findIndex(c => c.id === draggingId)
    const to   = columns.findIndex(c => c.id === targetId)
    if (from === -1 || to === -1) return
    const next = [...columns]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setColumns(next)
    setDragOver(null); setDraggingId(null)
    await reorderBoardColumns(board.id, next.map(c => c.id))
    flash('Columns reordered')
  }

  // ── Privacy toggle ────────────────────────────────────────────────────────
  const togglePrivate = async () => {
    const next = !isPrivate
    setIsPrivate(next)
    const result = await updateBoard(board.id, { is_private: next })
    if (!result.success) {
      setIsPrivate(!next) // revert on failure
      setError(result.error ?? 'Failed')
      return
    }
    flash(next ? 'Board is now private' : 'Board privacy turned off')
  }

  // ── Team toggle ───────────────────────────────────────────────────────────
  const toggleTeam = async (teamId: string) => {
    const isIn = assignedTeamIds.has(teamId)
    if (isIn) {
      await removeBoardTeam(board.id, teamId)
      setAssignedTeamIds(prev => { const next = new Set(prev); next.delete(teamId); return next })
    } else {
      await addBoardTeam(board.id, teamId)
      setAssignedTeamIds(prev => new Set([...prev, teamId]))
    }
    flash(isIn ? 'Team removed' : 'Team added')
  }

  // ── Board delete ──────────────────────────────────────────────────────────
  const handleDeleteBoard = async () => {
    if (board.is_default) { setError('Cannot delete the default board'); return }
    if (!confirm(`Delete "${board.name}"? All projects will lose their board assignment.`)) return
    const result = await deleteBoard(board.id)
    if (!result.success) { setError(result.error ?? 'Failed'); return }
    router.push('/app/boards')
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/app/boards/${board.id}`}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Board Settings</h1>
          <p className="text-sm text-slate-400">{board.name}</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      {/* Board details */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Board Details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
            <input value={boardName} onChange={e => setBoardName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
            <input value={boardDesc} onChange={e => setBoardDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">Color:</span>
          {COLORS.slice(0, 8).map(c => (
            <button key={c} onClick={() => setBoardColor(c)}
              className={cn('h-5 w-5 rounded-full border-2 transition-all', boardColor === c ? 'border-slate-900 scale-110' : 'border-transparent')}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <button onClick={saveBoardDetails} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </section>

      {/* Columns */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Columns</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {columns.length} of {BOARD_COLUMN_MAX} · min {BOARD_COLUMN_MIN} required · drag to reorder
            </p>
          </div>
          {columns.length < BOARD_COLUMN_MAX && (
            <button onClick={() => setAddingCol(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <Plus size={13} /> Add Column
            </button>
          )}
        </div>

        <div className="space-y-2">
          {columns.map(col => (
            <div key={col.id}
              draggable
              onDragStart={() => setDraggingId(col.id)}
              onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
              onDrop={() => handleDrop(col.id)}
              onDragEnd={() => { setDragOver(null); setDraggingId(null) }}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
                dragOver === col.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-slate-50',
                draggingId === col.id && 'opacity-50'
              )}>
              <GripVertical size={16} className="text-slate-300 cursor-grab flex-shrink-0" />

              {editingColId === col.id ? (
                <>
                  <input autoFocus value={editColName} onChange={e => setEditColName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveColEdit(col.id)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <div className="flex items-center gap-1">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setEditColColor(c)}
                        className={cn('h-4 w-4 rounded-full border transition-all', editColColor === c ? 'border-slate-900 scale-110' : 'border-transparent')}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={editColDone} onChange={e => setEditColDone(e.target.checked)} className="rounded" />
                    Done
                  </label>
                  <button onClick={() => saveColEdit(col.id)} className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50"><Check size={15} /></button>
                  <button onClick={() => setEditingColId(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
                </>
              ) : (
                <>
                  <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="flex-1 text-sm font-medium text-slate-800">{col.name}</span>
                  {col.is_done && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">DONE</span>}
                  <button onClick={() => { setEditingColId(col.id); setEditColName(col.name); setEditColColor(col.color); setEditColDone(col.is_done) }}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  {canAdmin && (
                    <button onClick={() => handleDeleteColumn(col)}
                      disabled={columns.length <= BOARD_COLUMN_MIN}
                      className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* New column form */}
        {addingCol && (
          <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <input autoFocus value={newColName} onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddColumn()}
              placeholder="Column name"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="flex items-center gap-1">
              {COLORS.map(c => (
                <button key={c} onClick={() => setNewColColor(c)}
                  className={cn('h-4 w-4 rounded-full border transition-all', newColColor === c ? 'border-slate-900 scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <button onClick={handleAddColumn}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
              Add
            </button>
            <button onClick={() => { setAddingCol(false); setNewColName('') }}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
          </div>
        )}
      </section>

      {/* Visibility & privacy — owners/admins control access */}
      {canAdmin && (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Visibility &amp; Privacy</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isPrivate
              ? 'Private — only the board creator and owners/admins can see this board.'
              : assignedTeamIds.size === 0
                ? 'No teams assigned — this board is visible to all organization members.'
                : `Visible only to members of ${assignedTeamIds.size} team${assignedTeamIds.size !== 1 ? 's' : ''}. Owners and Admins always see all boards.`}
          </p>
        </div>

        {/* Private toggle */}
        <button
          type="button"
          onClick={togglePrivate}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all',
            isPrivate ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
          )}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
            {isPrivate ? <Lock size={15} className="text-indigo-600" /> : <Globe size={15} className="text-slate-400" />}
            {isPrivate ? 'Private board' : 'Make this board private'}
          </span>
          <span className={cn('relative h-5 w-9 flex-shrink-0 rounded-full transition-colors', isPrivate ? 'bg-indigo-600' : 'bg-slate-300')}>
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', isPrivate ? 'left-4' : 'left-0.5')} />
          </span>
        </button>

        <p className="text-[11px] text-slate-400">
          Linking teams below grants those members access too — useful when a board should be private from the wider company but shared with a specific team.
        </p>

        {teams.length === 0 ? (
          <p className="text-sm text-slate-400">No teams yet. <Link href="/app/teams" className="text-indigo-600 hover:underline">Create a team →</Link></p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teams.map(team => {
              const isIn = assignedTeamIds.has(team.id)
              return (
                <button key={team.id} onClick={() => toggleTeam(team.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all',
                    isIn ? 'border-transparent text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                  )}
                  style={isIn ? { backgroundColor: team.color } : {}}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isIn ? 'rgba(255,255,255,0.6)' : team.color }} />
                  {team.name}
                  {isIn && <Check size={13} />}
                </button>
              )
            })}
          </div>
        )}
      </section>
      )}

      {/* Danger zone */}
      {canAdmin && !board.is_default && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-rose-800">Danger Zone</h2>
          <p className="text-xs text-rose-600">
            Deleting this board removes the workspace. Projects will lose their board assignment but will not be deleted.
          </p>
          <button onClick={handleDeleteBoard}
            className="flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition-colors">
            <Trash2 size={14} /> Delete This Board
          </button>
        </section>
      )}
    </div>
  )
}
