'use client'

// Sheet navigator: discipline-grouped list with instant search, used as the
// viewer's left sidebar on desktop and inside the bottom drawer on mobile.
// Searching matches number, title, discipline, tags — typing "A1.01",
// "mechanical" or "roof" jumps straight to the drawing.

import { useMemo, useRef, useState, useEffect } from 'react'
import { Search, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { disciplineRank, compareSheetNumbers } from '@/lib/plans/constants'
import type { SheetWithRevision } from '@/types/plans'
import { Thumb } from './Thumb'

export function groupSheets(sheets: SheetWithRevision[]): { discipline: string; sheets: SheetWithRevision[] }[] {
  const map = new Map<string, SheetWithRevision[]>()
  for (const s of sheets) {
    const list = map.get(s.discipline) ?? []
    list.push(s)
    map.set(s.discipline, list)
  }
  return [...map.entries()]
    .sort((a, b) => disciplineRank(a[0]) - disciplineRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([discipline, list]) => ({
      discipline,
      sheets: list.sort((a, b) => compareSheetNumbers(a.sheet_number, b.sheet_number)),
    }))
}

export function filterSheets(sheets: SheetWithRevision[], q: string): SheetWithRevision[] {
  const query = q.trim().toLowerCase()
  if (!query) return sheets
  const terms = query.split(/\s+/)
  return sheets.filter((s) => {
    const hay = `${s.sheet_number} ${s.title} ${s.discipline} ${s.tags.join(' ')} ${s.floor ?? ''} ${s.building ?? ''} ${s.area ?? ''}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

export function SheetSidebar({
  sheets, currentSheetId, onSelect, showThumbs = true, autoFocusSearch, className,
}: {
  sheets: SheetWithRevision[]
  currentSheetId: string | null
  onSelect: (sheet: SheetWithRevision) => void
  showThumbs?: boolean
  autoFocusSearch?: boolean
  className?: string
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { if (autoFocusSearch) inputRef.current?.focus() }, [autoFocusSearch])
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentSheetId])

  const groups = useMemo(() => groupSheets(filterSheets(sheets, query)), [sheets, query])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="p-2.5 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sheets…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = groups[0]?.sheets[0]
                if (first) onSelect(first)
              }
              if (e.key === 'Escape') setQuery('')
              e.stopPropagation()
            }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-1.5 pb-3">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-slate-400">No sheets match “{query}”</p>
        )}
        {groups.map((g) => (
          <div key={g.discipline}>
            <div className="sticky top-0 z-10 px-2 pt-3 pb-1 bg-inherit">
              <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{g.discipline}</p>
            </div>
            {g.sheets.map((s) => {
              const active = s.id === currentSheetId
              return (
                <button
                  key={s.id}
                  ref={active ? currentRef : undefined}
                  onClick={() => onSelect(s)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors',
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
                  )}
                >
                  {showThumbs && (
                    <Thumb path={s.current?.thumb_path ?? null} alt={s.sheet_number}
                      className="w-11 h-8 rounded border border-slate-200 dark:border-slate-700 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-xs font-semibold font-mono flex items-center gap-1', active ? 'text-white' : 'text-slate-900 dark:text-slate-100')}>
                      {s.sheet_number}
                      {s.is_favorite && <Star size={10} className={active ? 'text-amber-300' : 'text-amber-400'} fill="currentColor" />}
                    </p>
                    <p className={cn('text-[11px] truncate', active ? 'text-indigo-100' : 'text-slate-500')}>
                      {s.title || 'Untitled'}
                    </p>
                  </div>
                  {s.revision_count > 1 && (
                    <span className={cn('text-[9px] font-bold rounded px-1 py-0.5 shrink-0',
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')}>
                      R{s.current?.revision_label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
