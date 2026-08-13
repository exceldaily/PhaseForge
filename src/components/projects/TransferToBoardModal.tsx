'use client'

// Add a project to any board (or move/remove it) at any time. This LINKS the
// project — it stays on the Projects page untouched and appears on the board
// as a card; nothing is moved or deleted, and both views stay in sync.
// Boards + their columns are fetched with the caller's own session, so board
// privacy rules apply automatically; the board's card then shows whatever
// fields that board is configured to display — no extra mapping needed.

import { useEffect, useMemo, useState } from 'react'
import { Layers, ArrowRight, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { updateProjectBoard } from '@/app/app/projects/[id]/actions'

interface BoardChoice {
  id: string
  name: string
  color: string
  columns: { id: string; name: string; color: string; sort_order: number }[]
}

export function TransferToBoardModal({
  projectId, projectName, currentBoardId, onClose, onDone,
}: {
  projectId: string
  projectName: string
  currentBoardId: string | null
  onClose: () => void
  onDone?: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [boards, setBoards] = useState<BoardChoice[] | null>(null)
  const [boardId, setBoardId] = useState<string | null>(currentBoardId)
  const [columnId, setColumnId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: err } = await supabase
        .from('boards')
        .select('id, name, color, board_columns(id, name, color, sort_order)')
        .order('name')
      if (cancelled) return
      if (err) { setError(err.message); setBoards([]); return }
      const mapped: BoardChoice[] = (data ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        color: b.color,
        columns: [...((b.board_columns ?? []) as BoardChoice['columns'])].sort((a, z) => a.sort_order - z.sort_order),
      }))
      setBoards(mapped)
      // Preselect: current board (if any) with its first column, else nothing
      const initial = mapped.find((b) => b.id === currentBoardId) ?? null
      if (initial) setColumnId(initial.columns[0]?.id ?? null)
    })()
    return () => { cancelled = true }
  }, [supabase, currentBoardId])

  const selected = boards?.find((b) => b.id === boardId) ?? null

  const transfer = async () => {
    if (!selected) return
    const targetColumn = columnId && selected.columns.some((c) => c.id === columnId)
      ? columnId
      : selected.columns[0]?.id ?? null
    setSaving(true)
    setError('')
    const res = await updateProjectBoard(projectId, selected.id, targetColumn)
    setSaving(false)
    if (!res.success) { setError(res.error ?? 'Transfer failed'); return }
    onDone?.()
    onClose()
  }

  const removeFromBoard = async () => {
    setSaving(true)
    setError('')
    const res = await updateProjectBoard(projectId, null, null)
    setSaving(false)
    if (!res.success) { setError(res.error ?? 'Failed'); return }
    onDone?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <Layers size={16} className="text-indigo-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Add to board</h2>
              <p className="text-[11px] text-slate-500 truncate">{projectName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!boards && (
            <div className="py-8 flex justify-center">
              <div className="h-6 w-6 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
            </div>
          )}

          {boards && boards.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">
              No boards yet. Create one on the Boards page first.
            </p>
          )}

          {boards && boards.length > 0 && (
            <>
              <div>
                <p className="text-xs font-medium text-slate-700 mb-1.5">Board</p>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {boards.map((b) => (
                    <button key={b.id}
                      onClick={() => { setBoardId(b.id); setColumnId(b.columns[0]?.id ?? null) }}
                      className={cn(
                        'w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                        boardId === b.id
                          ? 'border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-200'
                          : 'border-slate-200 hover:border-indigo-300',
                      )}>
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="text-sm font-medium text-slate-800 truncate flex-1">{b.name}</span>
                      {b.id === currentBoardId && (
                        <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 rounded-full px-1.5 py-0.5 shrink-0">Current</span>
                      )}
                      <span className="text-[10px] text-slate-400 shrink-0">{b.columns.length} stages</span>
                    </button>
                  ))}
                </div>
              </div>

              {selected && selected.columns.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-700 mb-1.5">Place in stage</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.columns.map((c) => (
                      <button key={c.id} onClick={() => setColumnId(c.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                          columnId === c.id
                            ? 'border-indigo-400 bg-indigo-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-indigo-300',
                        )}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: columnId === c.id ? '#fff' : c.color }} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                This links the project — it stays right where it is on the Projects page and
                also appears on the board, always in sync. The board card shows the fields
                that board is configured to display.
              </p>
            </>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-2">
          {currentBoardId && (
            <button onClick={removeFromBoard} disabled={saving}
              className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50">
              Remove from board
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={transfer} loading={saving} disabled={!selected || saving}>
              <ArrowRight size={13} /> {selected?.id === currentBoardId ? 'Move stage' : 'Add to board'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
