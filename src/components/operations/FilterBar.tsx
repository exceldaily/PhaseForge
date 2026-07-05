'use client'

// Reusable, URL-state-driven filter bar used by every operations list page.
// Filters live in the query string so they persist across navigation and are
// shareable. Pages declare FilterDefs; filtering itself happens in the page
// (client-side over the loaded org dataset for v1 — see FILTERING_AND_SAVED_VIEWS.md).

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterOption {
  value: string
  label: string
}

export interface FilterDef {
  key: string
  label: string
  type: 'select' | 'multiselect' | 'daterange'
  options?: FilterOption[]
}

export type FilterState = Record<string, string>

export function useUrlFilters(): [FilterState, (next: FilterState) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const state = useMemo(() => {
    const out: FilterState = {}
    searchParams.forEach((v, k) => { out[k] = v })
    return out
  }, [searchParams])

  const setState = useCallback((next: FilterState) => {
    const params = new URLSearchParams()
    Object.entries(next).forEach(([k, v]) => { if (v) params.set(k, v) })
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false })
  }, [router, pathname])

  return [state, setState]
}

// Multi-select values are comma-joined in the URL: status=open,assigned
export function splitMulti(value: string | undefined): string[] {
  return value ? value.split(',').filter(Boolean) : []
}

export function FilterBar({
  defs,
  filters,
  onChange,
  searchPlaceholder = 'Search…',
}: {
  defs: FilterDef[]
  filters: FilterState
  onChange: (next: FilterState) => void
  searchPlaceholder?: string
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const activeCount = defs.reduce((n, d) => {
    if (d.type === 'daterange') return n + (filters[`${d.key}_from`] || filters[`${d.key}_to`] ? 1 : 0)
    return n + (filters[d.key] ? 1 : 0)
  }, 0) + (filters.q ? 1 : 0)

  const set = (key: string, value: string) => {
    const next = { ...filters }
    if (value) next[key] = value
    else delete next[key]
    onChange(next)
  }

  const clearAll = () => onChange({})

  const controls = (
    <>
      {defs.map((def) => {
        if (def.type === 'select') {
          return (
            <select
              key={def.key}
              value={filters[def.key] ?? ''}
              onChange={(e) => set(def.key, e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">{def.label}: All</option>
              {def.options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )
        }
        if (def.type === 'multiselect') {
          const selected = splitMulti(filters[def.key])
          return (
            <details key={def.key} className="relative">
              <summary className={cn(
                'flex cursor-pointer select-none items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs [&::-webkit-details-marker]:hidden',
                selected.length
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              )}>
                {def.label}{selected.length > 0 && `: ${selected.length}`}
                <ChevronDown size={12} />
              </summary>
              <div className="absolute z-30 mt-1 flex max-h-64 min-w-40 flex-col gap-1 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {def.options?.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 whitespace-nowrap rounded px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={selected.includes(o.value)}
                      onChange={() => {
                        const next = selected.includes(o.value)
                          ? selected.filter((v) => v !== o.value)
                          : [...selected, o.value]
                        set(def.key, next.join(','))
                      }}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </details>
          )
        }
        // daterange
        return (
          <span key={def.key} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            {def.label}
            <input
              type="date"
              value={filters[`${def.key}_from`] ?? ''}
              onChange={(e) => set(`${def.key}_from`, e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            –
            <input
              type="date"
              value={filters[`${def.key}_to`] ?? ''}
              onChange={(e) => set(`${def.key}_to`, e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </span>
        )
      })}
      {activeCount > 0 && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <X size={12} /> Clear all
        </button>
      )}
    </>
  )

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={filters.q ?? ''}
          onChange={(e) => set('q', e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>

      {/* Desktop: inline controls. Mobile: drawer toggle. */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">{controls}</div>

      <button
        onClick={() => setDrawerOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs sm:hidden',
          activeCount > 0
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-slate-300 bg-white text-slate-600'
        )}
      >
        <SlidersHorizontal size={13} />
        Filters
        {activeCount > 0 && (
          <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">{activeCount}</span>
        )}
      </button>

      {drawerOpen && (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:hidden dark:border-slate-700 dark:bg-slate-900">
          {controls}
        </div>
      )}
    </div>
  )
}
