'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Kanban } from 'lucide-react'
import { BOARD_FILTER_NONE, BoardOption } from '@/lib/boardFilter'
import { cn } from '@/lib/utils'

interface BoardFilterProps {
  boards: BoardOption[]
  selectedBoardId: string | null
  className?: string
}

/**
 * Org-wide board selector. Writes the choice to the `?board=` search param so
 * server components can filter their queries to a single board's projects.
 */
export function BoardFilter({ boards, selectedBoardId, className }: BoardFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (boards.length === 0) return null

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('board', value)
    else params.delete('board')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <label className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Kanban size={14} /> Board
      </span>
      <select
        value={selectedBoardId ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">All boards</option>
        {boards.map((board) => (
          <option key={board.id} value={board.id}>
            {board.name}
          </option>
        ))}
        <option value={BOARD_FILTER_NONE}>Not on a board</option>
      </select>
    </label>
  )
}
