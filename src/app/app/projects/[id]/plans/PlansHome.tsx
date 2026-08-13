'use client'

// Plans home: the drawing set at a glance. Grid / list / navigator views
// (choice remembered), instant search across metadata AND extracted sheet
// text, chip filters, quick filters, bulk select with a floating action bar,
// one-step downloads, printing, plan packages, what's-new banner, favorites
// and recently-viewed — built so a 50-sheet set stays fast (lazy thumbnails,
// no PDFs loaded until asked for).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, LayoutGrid, List as ListIcon, Columns2, Search, Upload, Download,
  Printer, Star, X, ChevronDown, FileText, MapPin, CheckSquare, Square as SquareIcon,
  Package, ListOrdered, Archive, Trash2, Tag as TagIcon, Clock, Sparkles, MoreVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { Thumb } from '@/components/plans/Thumb'
import { SheetSidebar, groupSheets, filterSheets } from '@/components/plans/SheetSidebar'
import { compareSheetNumbers, disciplineRank, STANDARD_DISCIPLINES } from '@/lib/plans/constants'
import {
  downloadSingleSheet, downloadCombinedPdf, downloadZip, printSheets, downloadPackage,
  type DownloadProgress,
} from '@/lib/plans/download'
import { updateSheetMeta, deleteSheets, logPlanDownload } from './actions'
import { UploadWizard } from './UploadWizard'
import type { PlanSet, SheetWithRevision } from '@/types/plans'

type ViewMode = 'grid' | 'list' | 'navigator'
type QuickFilter = 'all' | 'recent' | 'favorites' | 'revised' | string // discipline names

interface Props {
  projectId: string
  projectName: string
  companyId: string
  userId: string
  canManage: boolean
  isAdmin: boolean
  sheets: SheetWithRevision[]
  sets: PlanSet[]
  lastVisitAt: string | null
}

export function PlansHome({
  projectId, projectName, companyId, userId, canManage, isAdmin,
  sheets: initialSheets, sets, lastVisitAt,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [sheets, setSheets] = useState(initialSheets)
  // Reconcile fresh server data after router.refresh (render-phase adjustment,
  // the React-sanctioned alternative to a setState-in-effect cascade)
  const [prevInitial, setPrevInitial] = useState(initialSheets)
  if (prevInitial !== initialSheets) {
    setPrevInitial(initialSheets)
    setSheets(initialSheets)
  }

  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid'
    const saved = localStorage.getItem('pf-plans-view') as ViewMode | null
    return saved === 'grid' || saved === 'list' || saved === 'navigator' ? saved : 'grid'
  })
  const changeView = (v: ViewMode) => { setView(v); localStorage.setItem('pf-plans-view', v) }

  const [query, setQuery] = useState('')
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [filterSet, setFilterSet] = useState<string>('')
  const [showArchived, setShowArchived] = useState(false)
  // Stable "now" for the recently-updated cutoff (render must stay pure)
  const [loadedAt] = useState(() => Date.now())
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dlState, setDlState] = useState<{ label: string; done: number; total: number } | null>(null)
  const [dlMenuOpen, setDlMenuOpen] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [whatsNewDismissed, setWhatsNewDismissed] = useState(false)

  const notify = useCallback((m: string) => {
    setToast(m); setTimeout(() => setToast((t) => t === m ? null : t), 2600)
  }, [])

  // Mark the module visited (after the what's-new snapshot was taken server-side)
  useEffect(() => {
    supabase.from('plan_module_visits').upsert({
      user_id: userId, project_id: projectId, company_id: companyId,
      last_visit_at: new Date().toISOString(),
    }, { onConflict: 'user_id,project_id' }).then(() => {})
  }, [supabase, userId, projectId, companyId])

  // '/' or Ctrl/Cmd+K focuses search — the command surface: type a number,
  // Enter opens the first match.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault(); searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Derived data ──
  const active = useMemo(() => sheets.filter((s) => showArchived || !s.is_archived), [sheets, showArchived])
  const disciplines = useMemo(() =>
    [...new Set(active.map((s) => s.discipline))].sort((a, b) => disciplineRank(a) - disciplineRank(b)),
    [active])

  const filtered = useMemo(() => {
    let list = active
    if (filterSet) list = list.filter((s) => s.set_id === filterSet)
    if (quick === 'favorites') list = list.filter((s) => s.is_favorite)
    else if (quick === 'revised') list = list.filter((s) => s.revision_count > 1)
    else if (quick === 'recent') {
      const cutoff = loadedAt - 14 * 86400000
      list = list.filter((s) => s.current && Date.parse(s.current.created_at) > cutoff)
    } else if (quick !== 'all') list = list.filter((s) => s.discipline === quick)

    if (query.trim()) {
      const metaMatch = new Set(filterSheets(list, query).map((s) => s.id))
      const q = query.trim().toLowerCase()
      list = list.filter((s) => metaMatch.has(s.id) || (s.current?.extracted_text ?? '').toLowerCase().includes(q))
    }
    return [...list].sort((a, b) =>
      disciplineRank(a.discipline) - disciplineRank(b.discipline)
      || compareSheetNumbers(a.sheet_number, b.sheet_number))
  }, [active, filterSet, quick, query, loadedAt])

  const recentlyViewed = useMemo(() =>
    [...sheets].filter((s) => s.last_viewed_at)
      .sort((a, b) => Date.parse(b.last_viewed_at!) - Date.parse(a.last_viewed_at!))
      .slice(0, 6),
    [sheets])

  const whatsNew = useMemo(() => {
    if (!lastVisitAt) return null
    const t = Date.parse(lastVisitAt)
    const added = sheets.filter((s) => Date.parse(s.created_at) > t)
    const revised = sheets.filter((s) =>
      s.current && Date.parse(s.current.created_at) > t && Date.parse(s.created_at) <= t)
    if (added.length + revised.length === 0) return null
    return { added, revised }
  }, [sheets, lastVisitAt])

  const lastUpdate = useMemo(() => {
    let max = 0
    for (const s of sheets) if (s.current) max = Math.max(max, Date.parse(s.current.created_at))
    return max ? new Date(max).toISOString() : null
  }, [sheets])

  const selectedSheets = useMemo(() => filtered.filter((s) => selected.has(s.id)), [filtered, selected])
  const dlTargets = selectedSheets.length > 0 ? selectedSheets : filtered

  // ── Actions ──
  const openSheet = useCallback((s: SheetWithRevision) => {
    router.push(`/app/projects/${projectId}/plans/${s.id}`)
  }, [router, projectId])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleFavorite = useCallback(async (s: SheetWithRevision) => {
    setSheets((ss) => ss.map((x) => x.id === s.id ? { ...x, is_favorite: !s.is_favorite } : x))
    if (s.is_favorite) await supabase.from('plan_favorites').delete().eq('user_id', userId).eq('sheet_id', s.id)
    else await supabase.from('plan_favorites').insert({ user_id: userId, sheet_id: s.id, company_id: companyId })
  }, [supabase, userId, companyId])

  const progress: DownloadProgress = useCallback((label, done, total) => {
    setDlState({ label, done, total })
  }, [])

  const runDownload = useCallback(async (kind: 'pdf' | 'zip' | 'print' | 'package', targets: SheetWithRevision[]) => {
    setDlMenuOpen(false)
    if (targets.length === 0) { notify('Nothing to download'); return }
    try {
      if (kind === 'pdf') {
        if (targets.length === 1) await downloadSingleSheet(targets[0])
        else await downloadCombinedPdf(targets, `${projectName} - Plans`, progress)
      } else if (kind === 'zip') {
        await downloadZip(targets, `${projectName} - Plans`, progress)
      } else if (kind === 'print') {
        await printSheets(targets, progress)
      } else {
        const name = window.prompt('Package name', `${projectName} — Construction Set`)
        if (!name) { setDlState(null); return }
        await downloadPackage({ sheets: targets, projectName, packageName: name, onProgress: progress })
      }
      logPlanDownload(projectId, { kind, count: targets.length })
      setSelected(new Set()); setSelectMode(false)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDlState(null)
    }
  }, [projectId, projectName, progress, notify])

  const bulkUpdate = useCallback(async (patch: Parameters<typeof updateSheetMeta>[2], label: string) => {
    const ids = [...selected]
    const res = await updateSheetMeta(projectId, ids, patch)
    if (res.success) {
      setSheets((ss) => ss.map((s) => selected.has(s.id) ? { ...s, ...patch } as SheetWithRevision : s))
      notify(label)
      setSelected(new Set()); setSelectMode(false)
    } else notify(res.error)
  }, [selected, projectId, notify])

  const bulkDelete = useCallback(async () => {
    if (!window.confirm(`Permanently delete ${selected.size} drawing${selected.size === 1 ? '' : 's'} and every revision? This cannot be undone.`)) return
    const res = await deleteSheets(projectId, [...selected])
    if (res.success) {
      setSheets((ss) => ss.filter((s) => !selected.has(s.id)))
      notify('Deleted')
      setSelected(new Set()); setSelectMode(false)
    } else notify(res.error)
  }, [selected, projectId, notify])

  const deleteOne = useCallback(async (s: SheetWithRevision) => {
    if (!window.confirm(`Permanently delete ${s.sheet_number} and all of its revisions? This cannot be undone.`)) return
    const res = await deleteSheets(projectId, [s.id])
    if (res.success) {
      setSheets((ss) => ss.filter((x) => x.id !== s.id))
      notify(`${s.sheet_number} deleted`)
    } else notify(res.error)
  }, [projectId, notify])

  const archiveOne = useCallback(async (s: SheetWithRevision) => {
    const res = await updateSheetMeta(projectId, [s.id], { is_archived: !s.is_archived })
    if (res.success) {
      setSheets((ss) => ss.map((x) => x.id === s.id ? { ...x, is_archived: !s.is_archived } : x))
      notify(s.is_archived ? 'Restored' : 'Archived')
    } else notify(res.error)
  }, [projectId, notify])

  /** Long-press on a card (mobile pattern) enters select mode with it selected. */
  const startSelectWith = useCallback((id: string) => {
    setSelectMode(true)
    setSelected((prev) => new Set(prev).add(id))
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelected(new Set(filtered.map((s) => s.id)))
    setSelectMode(true)
  }, [filtered])

  const currentSetName = useMemo(() => {
    if (filterSet) return sets.find((s) => s.id === filterSet)?.name ?? ''
    return sets[0]?.name ?? null
  }, [filterSet, sets])

  const hasSheets = sheets.length > 0

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <Link href={`/app/projects/${projectId}`}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0">
              <ArrowLeft size={17} />
            </Link>
            <div className="min-w-0 mr-auto">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">Plans</h1>
              <p className="text-[11px] text-slate-500 truncate">
                {projectName}
                {currentSetName && <> · {currentSetName}</>}
                {hasSheets && <> · {active.length} sheet{active.length === 1 ? '' : 's'}</>}
                {lastUpdate && <> · updated {formatDate(lastUpdate)}</>}
              </p>
            </div>

            <div className="hidden sm:flex items-center rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
              <ViewBtn active={view === 'grid'} onClick={() => changeView('grid')} title="Grid"><LayoutGrid size={15} /></ViewBtn>
              <ViewBtn active={view === 'list'} onClick={() => changeView('list')} title="List"><ListIcon size={15} /></ViewBtn>
              <ViewBtn active={view === 'navigator'} onClick={() => changeView('navigator')} title="Sheet navigator"><Columns2 size={15} /></ViewBtn>
            </div>

            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setDlMenuOpen((o) => !o)} disabled={!hasSheets}
                className="hidden sm:inline-flex">
                <Download size={14} /> Download <ChevronDown size={12} />
              </Button>
              {dlMenuOpen && (
                <DownloadMenu
                  scopeLabel={selectedSheets.length > 0 ? `${selectedSheets.length} selected` : `${filtered.length} filtered`}
                  onPick={(kind) => runDownload(kind, dlTargets)}
                  onIndex={() => { setDlMenuOpen(false); setIndexOpen(true) }}
                  onClose={() => setDlMenuOpen(false)}
                />
              )}
            </div>
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" disabled={!hasSheets}
              onClick={() => runDownload('print', dlTargets)}>
              <Printer size={14} /> Print
            </Button>
            {canManage && (
              <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
                <Upload size={14} /> Upload
              </Button>
            )}
          </div>

          {/* Search + quick filters */}
          {hasSheets && (
            <div className="mt-2.5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-md">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search sheets, titles, text on drawings…  ( / )"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) openSheet(filtered[0]) }}
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {sets.length > 1 && (
                  <select value={filterSet} onChange={(e) => setFilterSet(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs">
                    <option value="">All sets</option>
                    {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                <button onClick={() => { setSelectMode((m) => !m); setSelected(new Set()) }}
                  className={cn('rounded-lg border px-2.5 py-1.5 text-xs font-medium shrink-0',
                    selectMode ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300')}>
                  Select
                </button>
                {selectMode && (
                  <button onClick={selected.size === filtered.length ? () => setSelected(new Set()) : selectAllFiltered}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
                    {selected.size === filtered.length && filtered.length > 0 ? 'Clear all' : `Select all (${filtered.length})`}
                  </button>
                )}
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
                <Chip active={quick === 'all'} onClick={() => setQuick('all')}>All plans</Chip>
                <Chip active={quick === 'recent'} onClick={() => setQuick('recent')}><Clock size={11} /> Recently updated</Chip>
                <Chip active={quick === 'favorites'} onClick={() => setQuick('favorites')}><Star size={11} /> Favorites</Chip>
                <Chip active={quick === 'revised'} onClick={() => setQuick('revised')}>Revised</Chip>
                <Chip active={showArchived} onClick={() => setShowArchived((a) => !a)}>Archived</Chip>
                {disciplines.map((d) => (
                  <Chip key={d} active={quick === d} onClick={() => setQuick(quick === d ? 'all' : d)}>{d}</Chip>
                ))}
              </div>

              {(quick !== 'all' || filterSet || query) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400">{filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>
                  {quick !== 'all' && <ActiveChip onClear={() => setQuick('all')}>{labelForQuick(quick)}</ActiveChip>}
                  {filterSet && <ActiveChip onClear={() => setFilterSet('')}>{sets.find((s) => s.id === filterSet)?.name}</ActiveChip>}
                  {query && <ActiveChip onClear={() => setQuery('')}>“{query}”</ActiveChip>}
                  <button onClick={() => { setQuick('all'); setFilterSet(''); setQuery('') }}
                    className="text-[11px] text-indigo-600 hover:underline">Clear all</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4">
        {/* ── What's new ── */}
        {whatsNew && !whatsNewDismissed && (
          <div className="mb-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-4 py-3 flex items-start gap-3">
            <Sparkles size={16} className="text-indigo-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                Since your last visit:
                {whatsNew.revised.length > 0 && ` ${whatsNew.revised.length} drawing${whatsNew.revised.length === 1 ? '' : 's'} revised`}
                {whatsNew.revised.length > 0 && whatsNew.added.length > 0 && ' · '}
                {whatsNew.added.length > 0 && ` ${whatsNew.added.length} added`}
              </p>
              <p className="text-[11px] text-indigo-700 dark:text-indigo-300 truncate">
                {[...whatsNew.revised.map((s) => `${s.sheet_number} → Rev ${s.current?.revision_label}`),
                  ...whatsNew.added.map((s) => `${s.sheet_number} new`)].slice(0, 5).join(' · ')}
              </p>
            </div>
            <button onClick={() => { setQuick('recent'); setWhatsNewDismissed(true) }}
              className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 underline shrink-0">Review</button>
            <button onClick={() => setWhatsNewDismissed(true)} className="text-indigo-400 shrink-0"><X size={14} /></button>
          </div>
        )}

        {/* ── Recently viewed rail ── */}
        {hasSheets && recentlyViewed.length > 0 && view !== 'navigator' && quick === 'all' && !query && (
          <div className="mb-4">
            <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1.5">Recently viewed</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentlyViewed.map((s) => (
                <button key={s.id} onClick={() => openSheet(s)}
                  className="shrink-0 w-32 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden text-left hover:border-indigo-300 transition-colors">
                  <Thumb path={s.current?.thumb_path ?? null} alt={s.sheet_number} className="h-20 w-full border-b border-slate-100 dark:border-slate-800" />
                  <div className="px-2 py-1">
                    <p className="text-[11px] font-bold font-mono text-slate-900 dark:text-white truncate">{s.sheet_number}</p>
                    <p className="text-[10px] text-slate-500 truncate">{s.title || '—'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!hasSheets && (
          <div className="mt-10 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-16 text-center">
            <FileText size={40} className="mx-auto text-indigo-400" />
            <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">No plans yet</h2>
            <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
              Drag your construction drawing set here to get started. PhaseForge splits
              multi-sheet PDF packages into individual drawings automatically — sheet numbers,
              titles and disciplines are detected for you.
            </p>
            {canManage ? (
              <Button variant="primary" className="mt-6" onClick={() => setUploadOpen(true)}>
                <Upload size={15} /> Upload plan set
              </Button>
            ) : (
              <p className="mt-6 text-xs text-slate-400">A project manager can upload the drawing set.</p>
            )}
            <p className="mt-3 text-[11px] text-slate-400">Supported: PDF</p>
          </div>
        )}

        {/* ── Content views ── */}
        {hasSheets && filtered.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate-400">No drawings match the current filters.</p>
        )}

        {hasSheets && view === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((s) => (
              <GridCard key={s.id} sheet={s} selectMode={selectMode} selected={selected.has(s.id)}
                onOpen={() => selectMode ? toggleSelect(s.id) : openSheet(s)}
                onToggleSelect={() => toggleSelect(s.id)}
                onToggleFavorite={() => toggleFavorite(s)}
                onLongPress={() => startSelectWith(s.id)}
                onDownload={() => downloadSingleSheet(s).catch(() => notify('Download failed'))}
                onArchive={canManage ? () => archiveOne(s) : undefined}
                onDelete={isAdmin ? () => deleteOne(s) : undefined} />
            ))}
          </div>
        )}

        {hasSheets && view === 'list' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  {selectMode && <th className="px-3 py-2 w-8" />}
                  <th className="px-3 py-2">Sheet</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Discipline</th>
                  <th className="px-3 py-2">Rev</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} onClick={() => selectMode ? toggleSelect(s.id) : openSheet(s)}
                    className={cn('border-b border-slate-50 dark:border-slate-800/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                      selected.has(s.id) && 'bg-indigo-50/60 dark:bg-indigo-950/30')}>
                    {selectMode && (
                      <td className="px-3 py-2">
                        {selected.has(s.id) ? <CheckSquare size={15} className="text-indigo-600" /> : <SquareIcon size={15} className="text-slate-300" />}
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {s.sheet_number}
                        {s.is_favorite && <Star size={11} className="text-amber-400" fill="currentColor" />}
                        {s.open_pin_count > 0 && <span className="inline-flex items-center text-[10px] text-rose-500"><MapPin size={10} />{s.open_pin_count}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-56 truncate">{s.title || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{s.discipline}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-xs font-semibold">R{s.current?.revision_label ?? '—'}</span>
                      {s.revision_count > 1 && <span className="text-[10px] text-slate-400"> ({s.revision_count})</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-xs">
                      {s.current?.revision_date ? formatDate(s.current.revision_date) : s.current ? formatDate(s.current.created_at) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {s.is_archived
                        ? <span className="text-[10px] font-bold text-slate-400">ARCHIVED</span>
                        : <span className="text-[10px] font-bold text-emerald-600">CURRENT</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button title="Download" className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                        onClick={() => downloadSingleSheet(s).catch(() => notify('Download failed'))}>
                        <Download size={14} />
                      </button>
                      {isAdmin && (
                        <button title="Delete" className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                          onClick={() => deleteOne(s)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasSheets && view === 'navigator' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex h-[70vh] overflow-hidden">
            <div className="w-72 border-r border-slate-100 dark:border-slate-800 shrink-0">
              <SheetSidebar sheets={filtered} currentSheetId={null} onSelect={openSheet} className="bg-white dark:bg-slate-900" />
            </div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 p-4 overflow-y-auto content-start">
              {filtered.map((s) => (
                <button key={s.id} onClick={() => openSheet(s)}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden text-left hover:border-indigo-400 transition-colors">
                  <Thumb path={s.current?.thumb_path ?? null} alt={s.sheet_number} className="aspect-[4/3] w-full" />
                  <div className="px-2 py-1.5 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold font-mono text-slate-900 dark:text-white">{s.sheet_number}</p>
                    <p className="text-[10px] text-slate-500 truncate">{s.title || '—'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-3">
          <div className="flex items-center gap-1 rounded-2xl bg-slate-900 text-white shadow-2xl px-3 py-2 max-w-full overflow-x-auto">
            <span className="text-xs font-semibold px-1.5 whitespace-nowrap">{selected.size} selected</span>
            <BulkBtn onClick={() => runDownload('pdf', selectedSheets)}><Download size={14} /> PDF</BulkBtn>
            <BulkBtn onClick={() => runDownload('zip', selectedSheets)}><Package size={14} /> ZIP</BulkBtn>
            <BulkBtn onClick={() => runDownload('print', selectedSheets)}><Printer size={14} /> Print</BulkBtn>
            {canManage && (
              <>
                <BulkBtn onClick={() => {
                  const tag = window.prompt('Add tag to selected sheets:')
                  if (tag?.trim()) {
                    const t = tag.trim()
                    // merge tag into each sheet's tags
                    const ids = [...selected]
                    Promise.all(ids.map((id) => {
                      const s = sheets.find((x) => x.id === id)
                      return updateSheetMeta(projectId, [id], { tags: [...new Set([...(s?.tags ?? []), t])] })
                    })).then(() => {
                      setSheets((ss) => ss.map((s) => selected.has(s.id) ? { ...s, tags: [...new Set([...s.tags, t])] } : s))
                      notify('Tagged'); setSelected(new Set())
                    })
                  }
                }}><TagIcon size={14} /> Tag</BulkBtn>
                <BulkBtn onClick={() => {
                  const d = window.prompt(`Discipline (${STANDARD_DISCIPLINES.slice(0, 6).join(', ')}…):`)
                  if (d?.trim()) bulkUpdate({ discipline: d.trim() }, 'Discipline updated')
                }}>Discipline</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_archived: true }, 'Archived')}><Archive size={14} /> Archive</BulkBtn>
              </>
            )}
            {isAdmin && <BulkBtn onClick={bulkDelete} danger><Trash2 size={14} /></BulkBtn>}
            <button onClick={() => { setSelected(new Set()); setSelectMode(false) }}
              className="p-1.5 rounded-lg hover:bg-white/10 ml-1"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* ── Mobile action bar (download/print always reachable) ── */}
      {hasSheets && selected.size === 0 && (
        <div className="sm:hidden fixed bottom-4 right-4 z-40 flex flex-col gap-2">
          <button onClick={() => setDlMenuOpen(true)}
            className="p-3.5 rounded-full bg-slate-900 text-white shadow-xl"><Download size={18} /></button>
        </div>
      )}
      {dlMenuOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex items-end bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setDlMenuOpen(false) }}>
          <div className="w-full bg-white dark:bg-slate-900 rounded-t-2xl p-4 space-y-1">
            <p className="text-xs font-semibold text-slate-500 px-2 pb-1">
              Download {selectedSheets.length > 0 ? `${selectedSheets.length} selected` : `${filtered.length} filtered`} sheets
            </p>
            <MobileDlBtn onClick={() => runDownload('pdf', dlTargets)}><FileText size={16} /> Combined PDF</MobileDlBtn>
            <MobileDlBtn onClick={() => runDownload('zip', dlTargets)}><Package size={16} /> ZIP of individual sheets</MobileDlBtn>
            <MobileDlBtn onClick={() => runDownload('print', dlTargets)}><Printer size={16} /> Print</MobileDlBtn>
            <MobileDlBtn onClick={() => runDownload('package', dlTargets)}><ListOrdered size={16} /> Plan package (cover + index)</MobileDlBtn>
          </div>
        </div>
      )}

      {/* ── Download progress ── */}
      {dlState && (
        <div className="fixed bottom-4 left-4 z-50 rounded-xl bg-slate-900 text-white shadow-2xl px-4 py-3 w-64">
          <p className="text-xs font-medium">{dlState.label}</p>
          <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-indigo-400 rounded-full transition-all"
              style={{ width: `${dlState.total ? Math.round((dlState.done / dlState.total) * 100) : 50}%` }} />
          </div>
        </div>
      )}

      {/* ── Drawing index modal ── */}
      {indexOpen && (
        <DrawingIndexModal
          sheets={filtered}
          projectName={projectName}
          onClose={() => setIndexOpen(false)}
          onDownload={async () => {
            setIndexOpen(false)
            try {
              const { buildPlanPackage } = await import('@/lib/plans/assembly')
              const bytes = await buildPlanPackage({
                projectName, packageName: 'Drawing Index',
                dateLabel: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                sheets: filtered.map((s) => ({
                  info: {
                    sheetNumber: s.sheet_number, title: s.title, discipline: s.discipline,
                    revisionLabel: s.current?.revision_label ?? '0', revisionDate: s.current?.revision_date ?? null,
                  },
                  pdf: new ArrayBuffer(0),
                })),
              })
              const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
              const a = document.createElement('a')
              a.href = url; a.download = `${projectName} - Drawing Index.pdf`; a.click()
              setTimeout(() => URL.revokeObjectURL(url), 30000)
            } catch { notify('Could not build the index') }
          }}
        />
      )}

      {/* ── Upload wizard ── */}
      {uploadOpen && (
        <UploadWizard
          projectId={projectId}
          existingSheets={sheets}
          existingSets={sets}
          onClose={() => setUploadOpen(false)}
          onComplete={() => { setUploadOpen(false); router.refresh() }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 inset-x-0 flex justify-center z-[60] pointer-events-none">
          <span className="text-xs font-medium bg-slate-900 text-white rounded-full px-4 py-2 shadow-lg">{toast}</span>
        </div>
      )}
    </div>
  )
}

function labelForQuick(q: string): string {
  switch (q) {
    case 'recent': return 'Recently updated'
    case 'favorites': return 'Favorites'
    case 'revised': return 'Revised'
    default: return q
  }
}

function ViewBtn({ children, active, onClick, title }: { children: React.ReactNode; active: boolean; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title}
      className={cn('p-1.5 rounded-md transition-colors', active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
      {children}
    </button>
  )
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap border transition-colors shrink-0',
        active
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300')}>
      {children}
    </button>
  )
}

function ActiveChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-[11px] font-medium">
      {children}
      <button onClick={onClear}><X size={11} /></button>
    </span>
  )
}

function BulkBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap',
        danger ? 'text-rose-300 hover:bg-rose-500/20' : 'hover:bg-white/10')}>
      {children}
    </button>
  )
}

function MobileDlBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
      {children}
    </button>
  )
}

function DownloadMenu({ scopeLabel, onPick, onIndex, onClose }: {
  scopeLabel: string
  onPick: (kind: 'pdf' | 'zip' | 'print' | 'package') => void
  onIndex: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])
  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50 p-1.5">
      <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{scopeLabel}</p>
      <MenuItem onClick={() => onPick('pdf')}><FileText size={14} /> Combined PDF</MenuItem>
      <MenuItem onClick={() => onPick('zip')}><Package size={14} /> ZIP of individual sheets</MenuItem>
      <MenuItem onClick={() => onPick('package')}><ListOrdered size={14} /> Plan package (cover + index)</MenuItem>
      <MenuItem onClick={onIndex}><ListOrdered size={14} /> Drawing index only</MenuItem>
    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-left">
      {children}
    </button>
  )
}

function GridCard({
  sheet: s, selectMode, selected, onOpen, onToggleSelect, onToggleFavorite,
  onLongPress, onDownload, onArchive, onDelete,
}: {
  sheet: SheetWithRevision
  selectMode: boolean
  selected: boolean
  onOpen: () => void
  onToggleSelect: () => void
  onToggleFavorite: () => void
  onLongPress: () => void
  onDownload: () => void
  onArchive?: () => void
  onDelete?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Long-press (500ms hold without moving) enters multi-select — the mobile
  // pattern; a suppressed click flag stops the release from opening the sheet.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null } }

  return (
    <div className={cn(
      'group relative rounded-xl border bg-white dark:bg-slate-900 overflow-hidden transition-all cursor-pointer select-none',
      selected ? 'border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-900' : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 hover:shadow-md',
    )}
      onClick={() => {
        if (longPressed.current) { longPressed.current = false; return }
        onOpen()
      }}
      onPointerDown={() => {
        longPressed.current = false
        pressTimer.current = setTimeout(() => { longPressed.current = true; onLongPress() }, 500)
      }}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerLeave={cancelPress}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen((o) => !o) }}
    >
      <Thumb path={s.current?.thumb_path ?? null} alt={s.sheet_number} className="aspect-[4/3] w-full" />
      <div className="px-2.5 py-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1">
          <p className="text-xs font-bold font-mono text-slate-900 dark:text-white truncate">{s.sheet_number}</p>
          {s.current && (
            <span className="text-[9px] font-bold text-slate-400 shrink-0">R{s.current.revision_label}</span>
          )}
          {s.open_pin_count > 0 && (
            <span className="inline-flex items-center text-[9px] text-rose-500 shrink-0"><MapPin size={9} />{s.open_pin_count}</span>
          )}
          <button className="ml-auto shrink-0" onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
            onPointerDown={(e) => e.stopPropagation()}>
            <Star size={13} className={s.is_favorite ? 'text-amber-400' : 'text-slate-200 group-hover:text-slate-300 hover:!text-amber-400'}
              fill={s.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button className="shrink-0 -mr-1 p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Sheet actions">
            <MoreVertical size={13} />
          </button>
        </div>
        <p className="text-[10px] text-slate-500 truncate">{s.title || s.discipline}</p>
      </div>
      {(selectMode || selected) && (
        <button
          className="absolute top-1.5 left-1.5 p-0.5 rounded bg-white/90 dark:bg-slate-900/90 shadow"
          onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
          onPointerDown={(e) => e.stopPropagation()}>
          {selected ? <CheckSquare size={16} className="text-indigo-600" /> : <SquareIcon size={16} className="text-slate-400" />}
        </button>
      )}
      {s.is_archived && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold bg-slate-900/80 text-white rounded px-1.5 py-0.5">ARCHIVED</span>
      )}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} onPointerDown={(e) => e.stopPropagation()} />
          <div className="absolute right-1.5 bottom-10 z-30 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-xl"
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <CardMenuItem onClick={() => { setMenuOpen(false); onDownload() }}><Download size={13} /> Download</CardMenuItem>
            <CardMenuItem onClick={() => { setMenuOpen(false); onToggleSelect() }}><CheckSquare size={13} /> Select</CardMenuItem>
            {onArchive && (
              <CardMenuItem onClick={() => { setMenuOpen(false); onArchive() }}>
                <Archive size={13} /> {s.is_archived ? 'Restore' : 'Archive'}
              </CardMenuItem>
            )}
            {onDelete && (
              <>
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                <CardMenuItem danger onClick={() => { setMenuOpen(false); onDelete() }}><Trash2 size={13} /> Delete</CardMenuItem>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CardMenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-left',
        danger ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800')}>
      {children}
    </button>
  )
}

function DrawingIndexModal({ sheets, projectName, onClose, onDownload }: {
  sheets: SheetWithRevision[]
  projectName: string
  onClose: () => void
  onDownload: () => void
}) {
  const groups = groupSheets(sheets)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Drawing index</h2>
            <p className="text-[11px] text-slate-500">{projectName} · {sheets.length} sheets</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {groups.map((g) => (
            <div key={g.discipline} className="mb-3">
              <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-800 pb-1 mb-1">{g.discipline}</p>
              {g.sheets.map((s) => (
                <div key={s.id} className="flex items-baseline gap-3 py-0.5 text-xs">
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 w-16 shrink-0">{s.sheet_number}</span>
                  <span className="text-slate-600 dark:text-slate-400 truncate flex-1">{s.title || '—'}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">R{s.current?.revision_label ?? '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          <Button variant="primary" size="sm" onClick={onDownload}><Download size={13} /> Download PDF</Button>
        </div>
      </div>
    </div>
  )
}
