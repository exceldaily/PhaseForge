'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Kanban } from 'lucide-react'
import { BOARD_FILTER_COOKIE, BOARD_FILTER_NONE, BoardOption } from '@/lib/boardFilter'
import { cn } from '@/lib/utils'

interface BoardFilterProps {
  boards: BoardOption[]
  selectedBoardId: string | null
  className?: string
}

/**
 * Org-wide board selector. Writes the choice to the `?board=` search param and
 * mirrors it into a cookie so board-aware pages can keep the same selection
 * even when a route transition does not carry the query string forward.
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

    if (value) {
      document.cookie = `${BOARD_FILTER_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
    } else {
      document.cookie = `${BOARD_FILTER_COOKIE}=; path=/; max-age=0; samesite=lax`
    }

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
