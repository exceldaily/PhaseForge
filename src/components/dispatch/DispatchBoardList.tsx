'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Radio, LayoutGrid, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { NewBoardModal } from './NewBoardModal'
import { DispatchBoard, DispatchColumn } from '@/types/app'
import { cn } from '@/lib/utils'

interface Props {
  boards: DispatchBoard[]
  userRole: string
}

export function DispatchBoardList({ boards, userRole }: Props) {
  const [showNewBoard, setShowNewBoard] = useState(false)
  const canManage = ['owner', 'admin', 'manager'].includes(userRole)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Radio size={18} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dispatch</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Service calls, tickets, and work orders
            </p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => setShowNewBoard(true)}>
            <Plus size={16} />
            New Board
          </Button>
        )}
      </div>

      {/* Board grid */}
      {boards.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LayoutGrid size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-600 dark:text-slate-400 font-medium mb-1">No dispatch boards yet</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">
            Create a board to start tracking service calls and tickets.
          </p>
          {canManage && (
            <Button onClick={() => setShowNewBoard(true)}>
              <Plus size={16} />
              Create First Board
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((board) => (
            <BoardCard key={board.id} board={board} canManage={canManage} />
          ))}
          {canManage && (
            <button
              onClick={() => setShowNewBoard(true)}
              className="flex flex-col items-center justify-center gap-2 h-48 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 hover:border-indigo-400 hover:text-indigo-500 dark:hover:border-indigo-500 transition-all"
            >
              <Plus size={24} />
              <span className="text-sm font-medium">New Board</span>
            </button>
          )}
        </div>
      )}

      <NewBoardModal open={showNewBoard} onClose={() => setShowNewBoard(false)} />
    </div>
  )
}

function BoardCard({ board, canManage }: { board: DispatchBoard; canManage: boolean }) {
  const columns = (board.columns ?? []).sort((a, b) => a.sort_order - b.sort_order) as DispatchColumn[]
  const openCount = board.open_cards ?? 0

  return (
    <Link
      href={`/app/dispatch/${board.id}`}
      className="group relative flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all"
    >
      {/* Top accent */}
      <div className="h-1.5 bg-indigo-500 w-full" />

      <div className="p-5 flex-1">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 dark:text-white truncate">{board.name}</h3>
            {board.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{board.description}</p>
            )}
          </div>
          {!board.is_active && (
            <span className="ml-2 flex-shrink-0 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full px-2 py-0.5">
              Inactive
            </span>
          )}
        </div>

        {/* Column pills */}
        <div className="flex flex-wrap gap-1 mb-4">
          {columns.slice(0, 5).map((col) => (
            <span
              key={col.id}
              className="inline-flex items-center gap-1 text-xs bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full px-2 py-0.5 border border-slate-200 dark:border-slate-700"
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
              {col.name}
              {board.card_counts?.[col.id] ? (
                <span className="font-medium text-slate-900 dark:text-white">{board.card_counts[col.id]}</span>
              ) : null}
            </span>
          ))}
          {columns.length > 5 && (
            <span className="text-xs text-slate-400 px-1">+{columns.length - 5} more</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <span className={cn(
          'text-xs font-medium',
          openCount > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
        )}>
          {openCount} open {openCount === 1 ? 'card' : 'cards'}
        </span>
        <ChevronRight size={14} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
      </div>
    </Link>
  )
}
