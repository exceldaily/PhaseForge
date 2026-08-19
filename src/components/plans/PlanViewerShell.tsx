'use client'

// Full-screen drawing viewer. Sheet switching is client-side (URL updated via
// history API, data fetched with the user's own supabase session, adjacent
// sheet PDFs preloaded) so moving between drawings feels instant — no page
// reloads. Desktop: sidebar + canvas + info panel. Mobile: full-bleed canvas,
// auto-hiding chrome, bottom sheet drawer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize,
  RotateCw, PanelLeft, Info, Star, Download, Printer, Link2, Layers,
  PenLine, MapPin, X, Undo2, Redo2, Eraser, MousePointer2, Ruler,
  Columns2, Eye, EyeOff, CheckCircle2, CloudDownload, Check, MoreHorizontal,
  ArrowUpRight, Minus, Square, Circle as CircleIcon, Cloud, Highlighter, Type as TypeIcon, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { PlanCanvas, type PlanCanvasHandle, type Rotation, type ViewTransform } from './PlanCanvas'
import { MarkupLayer } from './MarkupLayer'
import { PinLayer } from './PinLayer'
import { SheetSidebar } from './SheetSidebar'
import { preloadPlanFile, downloadPlanFile, saveOffline, isOffline, removeOffline, offlineSupported } from '@/lib/plans/storage'
import { compareSheetNumbers, disciplineRank, MARKUP_COLORS } from '@/lib/plans/constants'
import { formatDate } from '@/lib/dates'
import {
  saveMarkup, createPin, addPinComment, setPinStatus, deletePin, setCurrentRevision, saveCalibration, deleteSheets,
} from '@/app/app/projects/[id]/plans/actions'
import type {
  SheetWithRevision, PlanRevision, PlanPin, PlanPinComment, MarkupElement, MarkupTool, PlanViewState,
} from '@/types/plans'

interface Member { id: string; full_name: string | null }

interface Props {
  projectId: string
  projectName: string
  sheets: SheetWithRevision[]
  initialSheetId: string
  initialRevisionId: string | null
  initialCompareRevisionId: string | null
  initialView: PlanViewState | null
  members: Member[]
  currentUserId: string
  canManage: boolean
  canMarkup: boolean
  isAdmin?: boolean
}

export function PlanViewerShell({
  projectId, projectName, sheets: initialSheets, initialSheetId,
  initialRevisionId, initialCompareRevisionId, initialView,
  members, currentUserId, canManage, canMarkup, isAdmin = false,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const canvasRef = useRef<PlanCanvasHandle>(null)

  const [sheets, setSheets] = useState(initialSheets)
  const ordered = useMemo(() =>
    [...sheets].sort((a, b) =>
      disciplineRank(a.discipline) - disciplineRank(b.discipline)
      || compareSheetNumbers(a.sheet_number, b.sheet_number)),
    [sheets])

  const [sheetId, setSheetId] = useState(initialSheetId)
  const sheet = ordered.find((s) => s.id === sheetId) ?? ordered[0]
  const idx = ordered.findIndex((s) => s.id === sheet?.id)

  const [revisions, setRevisions] = useState<PlanRevision[]>([])
  const [viewRevisionId, setViewRevisionId] = useState<string | null>(initialRevisionId)
  const revision = revisions.find((r) => r.id === viewRevisionId) ?? revisions.find((r) => r.status === 'current') ?? null
  const isSuperseded = revision != null && revision.status !== 'current'

  // Compare target: an older revision of THIS sheet, or ANY other drawing in
  // the project. Revision ids are used as-is; other sheets use "sheet:<id>".
  const [compareRevId, setCompareRevId] = useState<string | null>(initialCompareRevisionId)
  const [compareMode, setCompareMode] = useState<'overlay' | 'side'>('overlay')
  const [overlayOpacity, setOverlayOpacity] = useState(0.5)
  const compareResolved = useMemo(() => {
    if (!compareRevId) return null
    if (compareRevId.startsWith('sheet:')) {
      const s = ordered.find((x) => x.id === compareRevId.slice(6))
      return s?.current?.pdf_path
        ? { pdfPath: s.current.pdf_path, label: s.sheet_number, long: `${s.sheet_number}${s.title ? ' — ' + s.title : ''}` }
        : null
    }
    const r = revisions.find((x) => x.id === compareRevId)
    return r ? { pdfPath: r.pdf_path, label: `R${r.revision_label}`, long: `REV ${r.revision_label}` } : null
  }, [compareRevId, ordered, revisions])
  const canCompare = revisions.length >= 2 || ordered.length >= 2

  // Panels / chrome
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [infoOpen, setInfoOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)   // mobile sheet drawer
  const [chromeHidden, setChromeHidden] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scalePct, setScalePct] = useState(100)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Markups
  const [markupOpen, setMarkupOpen] = useState(false)
  const [tool, setTool] = useState<MarkupTool | null>(null)
  const [color, setColor] = useState<string>(MARKUP_COLORS[0])
  const [scope, setScope] = useState<'personal' | 'project'>('personal')
  const [showMarkups, setShowMarkups] = useState(true)
  const [elements, setElements] = useState<MarkupElement[]>([])
  const [otherElements, setOtherElements] = useState<MarkupElement[]>([])
  const [selectedEl, setSelectedEl] = useState<string | null>(null)
  const history = useRef<MarkupElement[][]>([])
  const future = useRef<MarkupElement[][]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [calibrating, setCalibrating] = useState(false)

  // Pins
  const [pins, setPins] = useState<PlanPin[]>([])
  const [placingPin, setPlacingPin] = useState(false)
  const [activePin, setActivePin] = useState<PlanPin | null>(null)
  const [pinComments, setPinComments] = useState<PlanPinComment[]>([])
  const [showResolvedPins, setShowResolvedPins] = useState(false)

  const [offline, setOffline] = useState(false)

  const notify = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500)
  }, [])

  // ── Data loading per sheet ──
  useEffect(() => {
    if (!sheet) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('plan_revisions')
        .select('*').eq('sheet_id', sheet.id).order('created_at', { ascending: false })
      if (cancelled) return
      setRevisions((data ?? []) as PlanRevision[])
      const { data: pinRows } = await supabase.from('plan_pins')
        .select('*, author:profiles!plan_pins_created_by_fkey(full_name), assignee:profiles!plan_pins_assigned_to_fkey(full_name)')
        .eq('sheet_id', sheet.id)
      if (cancelled) return
      setPins(((pinRows ?? []) as unknown as (PlanPin & { author?: { full_name: string | null }; assignee?: { full_name: string | null } })[])
        .map((p) => ({ ...p, author_name: p.author?.full_name ?? null, assignee_name: p.assignee?.full_name ?? null })))
    })()
    return () => { cancelled = true }
  }, [sheet?.id, supabase, sheet])

  // Load markups when the viewed revision changes
  useEffect(() => {
    if (!revision) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('plan_markups')
        .select('scope, user_id, elements').eq('revision_id', revision.id)
      if (cancelled || !data) return
      const mine = data.find((m) => m.scope === scope && m.user_id === currentUserId)
      const others = data.filter((m) => !(m.scope === scope && m.user_id === currentUserId))
      setElements((mine?.elements ?? []) as MarkupElement[])
      setOtherElements(others.flatMap((m) => m.elements as MarkupElement[]))
      history.current = []
      future.current = []
    })()
    return () => { cancelled = true }
  }, [revision?.id, scope, supabase, currentUserId, revision])

  // Offline flag
  useEffect(() => {
    if (revision) isOffline(revision.pdf_path).then(setOffline)
  }, [revision])

  // Preload adjacent sheets so Next/Prev is instant
  useEffect(() => {
    const prev = ordered[idx - 1]?.current?.pdf_path
    const next = ordered[idx + 1]?.current?.pdf_path
    if (next) preloadPlanFile(next)
    if (prev) preloadPlanFile(prev)
  }, [idx, ordered])

  // ── View-state persistence + recently viewed ──
  const persistView = useCallback((targetSheetId: string) => {
    const state = canvasRef.current?.getViewState()
    const target = sheets.find((s) => s.id === targetSheetId)
    if (!target) return
    supabase.from('plan_views').upsert({
      user_id: currentUserId, sheet_id: targetSheetId, company_id: target.company_id,
      last_viewed_at: new Date().toISOString(), view_state: state ?? null,
    }, { onConflict: 'user_id,sheet_id' }).then(() => {})
  }, [supabase, currentUserId, sheets])

  useEffect(() => {
    const handler = () => persistView(sheetId)
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [persistView, sheetId])

  const [pendingView, setPendingView] = useState<PlanViewState | null>(initialView)

  const flushMarkupSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
  }, [])

  const goToSheet = useCallback((target: SheetWithRevision) => {
    if (target.id === sheetId) { setDrawerOpen(false); return }
    persistView(sheetId)
    flushMarkupSave()
    setViewRevisionId(null)
    setCompareRevId(null)
    setActivePin(null)
    setSheetId(target.id)
    setPendingView(null)
    setScalePct(100)
    setDrawerOpen(false)
    window.history.pushState({ pfSheet: target.id }, '', `/app/projects/${projectId}/plans/${target.id}`)
    // Restore the user's remembered position for that sheet (arrives async;
    // an effect below applies it to the freshly mounted canvas)
    supabase.from('plan_views').select('view_state').eq('user_id', currentUserId).eq('sheet_id', target.id)
      .maybeSingle().then(({ data }) => {
        if (data?.view_state) setPendingView(data.view_state as PlanViewState)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, projectId, persistView, supabase, currentUserId])

  // Apply a remembered view position that arrives after the canvas mounted
  useEffect(() => {
    if (pendingView) canvasRef.current?.applyViewState(pendingView)
  }, [pendingView])

  // Browser back/forward
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/\/plans\/([0-9a-f-]{36})/)
      if (m && m[1] !== sheetId && sheets.some((s) => s.id === m[1])) {
        persistView(sheetId)
        setViewRevisionId(null); setCompareRevId(null); setActivePin(null)
        setSheetId(m[1])
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [sheetId, sheets, persistView])

  const goPrev = useCallback(() => { if (ordered[idx - 1]) goToSheet(ordered[idx - 1]) }, [ordered, idx, goToSheet])
  const goNext = useCallback(() => { if (ordered[idx + 1]) goToSheet(ordered[idx + 1]) }, [ordered, idx, goToSheet])

  // ── Markup editing ──
  const pushElements = useCallback((next: MarkupElement[]) => {
    history.current.push(elements)
    if (history.current.length > 60) history.current.shift()
    future.current = []
    setElements(next)
    if (!revision) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveMarkup(revision.id, scope, next).then((r) => { if (!r.success) notify(r.error) })
    }, 800)
  }, [elements, revision, scope, notify])

  const undo = useCallback(() => {
    const prev = history.current.pop()
    if (!prev) return
    future.current.push(elements)
    setElements(prev)
    if (revision) saveMarkup(revision.id, scope, prev)
  }, [elements, revision, scope])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    history.current.push(elements)
    setElements(next)
    if (revision) saveMarkup(revision.id, scope, next)
  }, [elements, revision, scope])

  const deleteSelected = useCallback(() => {
    if (!selectedEl) return
    pushElements(elements.filter((e) => e.id !== selectedEl))
    setSelectedEl(null)
  }, [selectedEl, elements, pushElements])

  // ── Pins ──
  const handleCanvasTap = useCallback(async (pagePt: { x: number; y: number }) => {
    if (placingPin && sheet && revision) {
      const note = window.prompt('Pin note (e.g. "Verify RTU curb dimension")')
      setPlacingPin(false)
      if (!note?.trim()) return
      const res = await createPin({
        sheetId: sheet.id, revisionId: revision.id, x: pagePt.x, y: pagePt.y,
        note: note.trim(), assignedTo: null, dueDate: null,
      })
      if (res.success && res.data) {
        setPins((p) => [...p, {
          id: res.data!.id, company_id: sheet.company_id, sheet_id: sheet.id,
          revision_id: revision.id, x: pagePt.x, y: pagePt.y, note: note.trim(),
          status: 'open', assigned_to: null, due_date: null, linked_type: null, linked_id: null,
          created_by: currentUserId, created_at: new Date().toISOString(),
          resolved_by: null, resolved_at: null, author_name: 'You',
        }])
        notify('Pin added')
      } else if (!res.success) notify(res.error)
      return
    }
    // Plain tap on mobile toggles chrome (photo-viewer behavior)
    if (window.innerWidth < 768 && !tool && !calibrating) setChromeHidden((h) => !h)
  }, [placingPin, sheet, revision, currentUserId, notify, tool, calibrating])

  const openPin = useCallback(async (pin: PlanPin) => {
    setActivePin(pin)
    const { data } = await supabase.from('plan_pin_comments')
      .select('*, author:profiles!plan_pin_comments_author_id_fkey(full_name)')
      .eq('pin_id', pin.id).order('created_at')
    setPinComments(((data ?? []) as unknown as (PlanPinComment & { author?: { full_name: string | null } })[])
      .map((c) => ({ ...c, author_name: c.author?.full_name ?? null })))
  }, [supabase])

  // ── Favorites ──
  const toggleFavorite = useCallback(async () => {
    if (!sheet) return
    const isFav = sheet.is_favorite
    setSheets((ss) => ss.map((s) => s.id === sheet.id ? { ...s, is_favorite: !isFav } : s))
    if (isFav) {
      await supabase.from('plan_favorites').delete().eq('user_id', currentUserId).eq('sheet_id', sheet.id)
    } else {
      await supabase.from('plan_favorites').insert({ user_id: currentUserId, sheet_id: sheet.id, company_id: sheet.company_id })
    }
  }, [sheet, supabase, currentUserId])

  // ── Download / print / share ──
  const downloadCurrent = useCallback(async () => {
    if (!sheet || !revision) return
    try {
      const buf = await downloadPlanFile(revision.pdf_path)
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${sheet.sheet_number}${sheet.title ? ` - ${sheet.title}` : ''} (Rev ${revision.revision_label}).pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch { notify('Download failed — check your connection') }
  }, [sheet, revision, notify])

  const printCurrent = useCallback(async () => {
    if (!revision) return
    try {
      const buf = await downloadPlanFile(revision.pdf_path)
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
      window.open(url, '_blank')
      notify('Use the browser print button for paper size options')
    } catch { notify('Could not open the drawing for printing') }
  }, [revision, notify])

  const copyLink = useCallback(() => {
    const v = canvasRef.current?.getViewState()
    const params = new URLSearchParams()
    if (v && Math.abs(v.zoom - 1) > 0.05) {
      params.set('z', v.zoom.toFixed(2)); params.set('cx', v.cx.toFixed(4)); params.set('cy', v.cy.toFixed(4))
      if (v.rotation) params.set('rot', String(v.rotation))
    }
    if (isSuperseded && revision) params.set('rev', revision.id)
    const url = `${window.location.origin}/app/projects/${projectId}/plans/${sheetId}${params.size ? `?${params}` : ''}`
    navigator.clipboard.writeText(url).then(() => notify('Link copied'))
  }, [projectId, sheetId, isSuperseded, revision, notify])

  const toggleOffline = useCallback(async () => {
    if (!revision) return
    if (!offlineSupported()) { notify('Offline storage not supported in this browser'); return }
    try {
      if (offline) { await removeOffline(revision.pdf_path); setOffline(false); notify('Removed from offline') }
      else { await saveOffline(revision.pdf_path); setOffline(true); notify('Available offline ✓') }
    } catch { notify('Could not save for offline use') }
  }, [revision, offline, notify])

  // ── Fullscreen + keyboard ──
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.()
  }, [])
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      switch (e.key) {
        case 'ArrowLeft': goPrev(); break
        case 'ArrowRight': goNext(); break
        case '+': case '=': canvasRef.current?.zoomBy(1.25); break
        case '-': canvasRef.current?.zoomBy(0.8); break
        case 'f': case 'F': canvasRef.current?.fitPage(); break
        case '0': canvasRef.current?.zoomTo(100); break
        case 's': case 'S': setDrawerOpen(false); setSidebarOpen(true); document.querySelector<HTMLInputElement>('[data-pf-sheet-search]')?.focus(); break
        case 'Escape':
          if (tool) setTool(null)
          else if (markupOpen) setMarkupOpen(false)
          else if (isFullscreen) document.exitFullscreen?.()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, undo, redo, tool, markupOpen, isFullscreen])

  // Calibration flow
  const handleCalibration = useCallback((a: { x: number; y: number }, b: { x: number; y: number }) => {
    setCalibrating(false)
    if (!revision) return
    const input = window.prompt('Real-world distance between the two points (feet, e.g. 10 or 10.5):')
    const feet = input ? parseFloat(input) : NaN
    if (isNaN(feet) || feet <= 0) return
    const distPts = Math.hypot(
      (b.x - a.x) * (revision.page_width ?? 1),
      (b.y - a.y) * (revision.page_height ?? 1),
    )
    const cal = { pointsPerUnit: distPts / feet, unit: 'ft' as const }
    saveCalibration(revision.id, cal).then((r) => {
      if (r.success) {
        setRevisions((rs) => rs.map((x) => x.id === revision.id ? { ...x, scale_calibration: cal } : x))
        notify('Scale calibrated — measurements are now live')
      } else notify(r.error)
    })
  }, [revision, notify])

  if (!sheet) return null
  const pdfPath = revision?.pdf_path ?? sheet.current?.pdf_path ?? null
  const interactionMode = tool || calibrating ? 'draw' : 'navigate'

  return (
    <div ref={rootRef} className="fixed inset-0 z-40 flex flex-col bg-slate-200 dark:bg-slate-900">
      {/* ── Top bar ── */}
      <header className={cn(
        'flex items-center gap-1.5 px-2 sm:px-3 h-12 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shrink-0 transition-transform z-30',
        chromeHidden && '-translate-y-full absolute inset-x-0 top-0',
      )}>
        <button onClick={() => { persistView(sheetId); router.push(`/app/projects/${projectId}/plans`) }}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Back to plans">
          <ArrowLeft size={17} />
        </button>
        <button onClick={() => setSidebarOpen((o) => !o)}
          className={cn('hidden md:block p-2 rounded-lg', sidebarOpen ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}
          title="Sheet navigator">
          <PanelLeft size={17} />
        </button>
        <div className="min-w-0 mr-auto">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold font-mono text-slate-900 dark:text-white">{sheet.sheet_number}</p>
            <button onClick={toggleFavorite} className="p-0.5" title="Favorite">
              <Star size={14} className={sheet.is_favorite ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}
                fill={sheet.is_favorite ? 'currentColor' : 'none'} />
            </button>
            {revision && (
              <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5',
                isSuperseded ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700')}>
                REV {revision.revision_label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 truncate">{sheet.title || projectName}</p>
        </div>

        {/* Desktop zoom cluster */}
        <div className="hidden md:flex items-center gap-0.5 mr-1">
          <IconBtn title="Zoom out (-)" onClick={() => canvasRef.current?.zoomBy(0.8)}><ZoomOut size={16} /></IconBtn>
          <button onClick={() => canvasRef.current?.fitPage()}
            className="px-1.5 py-1 rounded-md text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums min-w-11"
            title="Fit page (F)">
            {scalePct}%
          </button>
          <IconBtn title="Zoom in (+)" onClick={() => canvasRef.current?.zoomBy(1.25)}><ZoomIn size={16} /></IconBtn>
          <IconBtn title="Rotate" onClick={() => {
            const next = (((revisionRotation(canvasRef) + 90) % 360)) as Rotation
            canvasRef.current?.setRotation(next)
          }}><RotateCw size={16} /></IconBtn>
        </div>

        <div className="flex items-center gap-0.5">
          {canMarkup && (
            <IconBtn title="Markup" active={markupOpen} onClick={() => { setMarkupOpen((o) => !o); setTool(null) }}>
              <PenLine size={16} />
            </IconBtn>
          )}
          <IconBtn title="Compare / overlay drawings" active={!!compareRevId}
            onClick={() => {
              if (compareRevId) { setCompareRevId(null); return }
              // Prefer an older revision of this sheet; otherwise overlay the
              // next drawing in the project so the bar opens with something.
              const prevRev = revisions.find((r) => r.id !== revision?.id)
              if (prevRev) { setCompareRevId(prevRev.id); return }
              const otherSheet = ordered.find((s) => s.id !== sheet?.id && s.current?.pdf_path)
              if (otherSheet) { setCompareRevId(`sheet:${otherSheet.id}`); return }
              notify('Add another drawing or revision to compare')
            }} disabled={!canCompare}>
            <Layers size={16} />
          </IconBtn>
          <IconBtn title="Copy link" onClick={copyLink} className="hidden sm:flex"><Link2 size={16} /></IconBtn>
          <IconBtn title="Download sheet" onClick={downloadCurrent} className="hidden sm:flex"><Download size={16} /></IconBtn>
          <IconBtn title="Print sheet" onClick={printCurrent} className="hidden sm:flex"><Printer size={16} /></IconBtn>
          <IconBtn title="Drawing info" active={infoOpen} onClick={() => setInfoOpen((o) => !o)}><Info size={16} /></IconBtn>
          <IconBtn title="Fullscreen" onClick={toggleFullscreen} className="hidden sm:flex">
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </IconBtn>
        </div>
      </header>

      {/* ── Superseded banner ── */}
      {isSuperseded && !chromeHidden && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold z-20 shrink-0">
          <span className="uppercase tracking-wide">⚠ Superseded drawing — a newer revision exists</span>
          <button className="ml-auto underline underline-offset-2 shrink-0"
            onClick={() => setViewRevisionId(null)}>
            Open current revision
          </button>
        </div>
      )}

      {/* ── Markup toolbar ── */}
      {markupOpen && !chromeHidden && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 overflow-x-auto z-20 shrink-0">
          <ToolBtn title="Select / pan" active={!tool && !calibrating} onClick={() => { setTool(null); setCalibrating(false) }}><MousePointer2 size={15} /></ToolBtn>
          <ToolBtn title="Arrow" active={tool === 'arrow'} onClick={() => setTool('arrow')}><ArrowUpRight size={15} /></ToolBtn>
          <ToolBtn title="Line" active={tool === 'line'} onClick={() => setTool('line')}><Minus size={15} /></ToolBtn>
          <ToolBtn title="Rectangle" active={tool === 'rect'} onClick={() => setTool('rect')}><Square size={15} /></ToolBtn>
          <ToolBtn title="Ellipse" active={tool === 'ellipse'} onClick={() => setTool('ellipse')}><CircleIcon size={15} /></ToolBtn>
          <ToolBtn title="Revision cloud" active={tool === 'cloud'} onClick={() => setTool('cloud')}><Cloud size={15} /></ToolBtn>
          <ToolBtn title="Freehand" active={tool === 'freehand'} onClick={() => setTool('freehand')}><Pencil size={15} /></ToolBtn>
          <ToolBtn title="Highlight" active={tool === 'highlight'} onClick={() => setTool('highlight')}><Highlighter size={15} /></ToolBtn>
          <ToolBtn title="Text" active={tool === 'text'} onClick={() => setTool('text')}><TypeIcon size={15} /></ToolBtn>
          <ToolBtn title={revision?.scale_calibration ? 'Measure' : 'Measure (calibrate first)'} active={tool === 'measure'}
            onClick={() => {
              if (!revision?.scale_calibration) { setCalibrating(true); setTool(null); notify('Tap two points a known distance apart') }
              else setTool('measure')
            }}>
            <Ruler size={15} />
          </ToolBtn>
          <ToolBtn title="Add pin" active={placingPin} onClick={() => { setPlacingPin((p) => !p); setTool(null) }}><MapPin size={15} /></ToolBtn>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
          {MARKUP_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              className={cn('w-5 h-5 rounded-full border-2 shrink-0', color === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent')}
              style={{ backgroundColor: c }} />
          ))}
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
          <ToolBtn title="Undo (Ctrl+Z)" onClick={undo}><Undo2 size={15} /></ToolBtn>
          <ToolBtn title="Redo" onClick={redo}><Redo2 size={15} /></ToolBtn>
          <ToolBtn title="Delete selected" onClick={deleteSelected} disabled={!selectedEl}><Eraser size={15} /></ToolBtn>
          <ToolBtn title={showMarkups ? 'Hide markups' : 'Show markups'} onClick={() => setShowMarkups((s) => !s)}>
            {showMarkups ? <Eye size={15} /> : <EyeOff size={15} />}
          </ToolBtn>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button onClick={() => setScope('personal')}
              className={cn('text-[11px] font-medium rounded-md px-2 py-1', scope === 'personal' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
              My markups
            </button>
            {canManage && (
              <button onClick={() => setScope('project')}
                className={cn('text-[11px] font-medium rounded-md px-2 py-1', scope === 'project' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
                Project
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Compare bar ── */}
      {compareRevId && compareResolved && revision && !chromeHidden && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-900 text-white text-xs z-20 shrink-0">
          <span className="font-semibold shrink-0">Overlay</span>
          <select value={compareRevId} onChange={(e) => setCompareRevId(e.target.value)}
            className="bg-slate-800 rounded px-1.5 py-1 text-xs max-w-[46vw] sm:max-w-xs">
            {revisions.filter((r) => r.id !== revision.id).length > 0 && (
              <optgroup label="This sheet — revisions">
                {revisions.filter((r) => r.id !== revision.id).map((r) => (
                  <option key={r.id} value={r.id}>REV {r.revision_label}{r.revision_date ? ` — ${formatDate(r.revision_date)}` : ''}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Other drawings">
              {ordered.filter((s) => s.id !== sheet?.id && s.current?.pdf_path).map((s) => (
                <option key={s.id} value={`sheet:${s.id}`}>{s.sheet_number}{s.title ? ` — ${s.title}` : ''}</option>
              ))}
            </optgroup>
          </select>
          <span className="text-slate-400 shrink-0 hidden sm:inline">on {sheet?.sheet_number} R{revision.revision_label}</span>
          <div className="flex rounded-md overflow-hidden border border-slate-700 shrink-0">
            <button onClick={() => setCompareMode('overlay')}
              className={cn('px-2 py-1', compareMode === 'overlay' ? 'bg-indigo-600' : 'bg-slate-800')}>Overlay</button>
            <button onClick={() => setCompareMode('side')}
              className={cn('px-2 py-1 items-center gap-1 hidden sm:flex', compareMode === 'side' ? 'bg-indigo-600' : 'bg-slate-800')}>
              <Columns2 size={12} /> Side by side
            </button>
          </div>
          {compareMode === 'overlay' && (
            <label className="flex items-center gap-2 min-w-0 flex-1 max-w-52" title="Slide to fade between the two drawings">
              <span className="text-slate-400 shrink-0">{compareResolved.label}</span>
              <input type="range" min={0} max={100} value={overlayOpacity * 100}
                onChange={(e) => setOverlayOpacity(Number(e.target.value) / 100)} className="flex-1 accent-indigo-500" />
              <span className="text-slate-400 shrink-0">R{revision.revision_label}</span>
            </label>
          )}
          <button onClick={() => setCompareRevId(null)} className="ml-auto p-1 rounded hover:bg-slate-800 shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Desktop sidebar */}
        <aside className={cn(
          'hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shrink-0',
          !sidebarOpen && 'md:hidden',
        )}>
          <SheetSidebar sheets={ordered} currentSheetId={sheet.id} onSelect={goToSheet} className="bg-white dark:bg-slate-900" />
        </aside>

        {/* Canvas area */}
        <div className="flex-1 min-w-0 relative">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
              <p className="text-sm font-medium">Could not load this drawing</p>
              <p className="text-xs">{error}</p>
              <button className="text-xs text-indigo-600 underline" onClick={() => { setError(null) }}>Retry</button>
            </div>
          ) : pdfPath ? (
            compareRevId && compareMode === 'side' && compareResolved ? (
              <div className="absolute inset-0 grid grid-cols-2 gap-px bg-slate-300 dark:bg-slate-700">
                <div className="relative">
                  <span className="absolute top-2 left-2 z-10 text-[10px] font-bold bg-slate-900/80 text-white rounded px-1.5 py-0.5">{compareResolved.long}</span>
                  <PlanCanvas key={`cmp-${compareRevId}`} pdfPath={compareResolved.pdfPath} className="absolute inset-0" />
                </div>
                <div className="relative">
                  <span className="absolute top-2 left-2 z-10 text-[10px] font-bold bg-emerald-600/90 text-white rounded px-1.5 py-0.5">{sheet?.sheet_number} REV {revision?.revision_label}</span>
                  <PlanCanvas key={`cur-${revision?.id}`} pdfPath={pdfPath} className="absolute inset-0" />
                </div>
              </div>
            ) : (
              <PlanCanvas
                key={`${sheet.id}-${revision?.id ?? 'cur'}`}
                ref={canvasRef}
                pdfPath={pdfPath}
                overlayPdfPath={compareRevId && compareMode === 'overlay' ? compareResolved?.pdfPath : null}
                overlayOpacity={overlayOpacity}
                interactionMode={interactionMode}
                initialView={pendingView}
                onScaleChange={setScalePct}
                onSingleTap={handleCanvasTap}
                onError={setError}
                className="absolute inset-0"
              >
                {(t: ViewTransform) => (
                  <>
                    {showMarkups && (
                      <MarkupLayer
                        t={t}
                        elements={elements}
                        backgroundElements={otherElements}
                        activeTool={tool}
                        color={color}
                        calibration={revision?.scale_calibration ?? null}
                        onCommit={(el) => pushElements([...elements, el])}
                        onSelectElement={setSelectedEl}
                        selectedId={selectedEl}
                        calibrating={calibrating}
                        onCalibrationPoints={handleCalibration}
                      />
                    )}
                    <PinLayer t={t} pins={pins} activePinId={activePin?.id ?? null}
                      onPinClick={openPin} showResolved={showResolvedPins} />
                  </>
                )}
              </PlanCanvas>
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
              This sheet has no drawing file yet.
            </div>
          )}

          {/* Mobile prev/next floating */}
          <div className={cn('md:hidden absolute inset-x-0 bottom-16 flex justify-between px-2 pointer-events-none z-10', chromeHidden && 'hidden')}>
            <FloatBtn onClick={goPrev} disabled={idx <= 0}><ChevronLeft size={20} /></FloatBtn>
            <FloatBtn onClick={goNext} disabled={idx >= ordered.length - 1}><ChevronRight size={20} /></FloatBtn>
          </div>

          {/* Desktop prev/next */}
          <div className="hidden md:block">
            <button onClick={goPrev} disabled={idx <= 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 dark:bg-slate-800/90 shadow border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-0 hover:bg-white z-10"
              title="Previous sheet (←)">
              <ChevronLeft size={18} />
            </button>
            <button onClick={goNext} disabled={idx >= ordered.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 dark:bg-slate-800/90 shadow border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-0 hover:bg-white z-10"
              title="Next sheet (→)">
              <ChevronRight size={18} />
            </button>
          </div>

          {placingPin && (
            <div className="absolute top-2 inset-x-0 flex justify-center z-10">
              <span className="text-xs font-medium bg-slate-900/90 text-white rounded-full px-3 py-1.5">Tap the drawing to place the pin</span>
            </div>
          )}
          {calibrating && (
            <div className="absolute top-2 inset-x-0 flex justify-center z-10">
              <span className="text-xs font-medium bg-slate-900/90 text-white rounded-full px-3 py-1.5">Calibration: tap two points a known distance apart</span>
            </div>
          )}
        </div>

        {/* Info panel */}
        {infoOpen && (
          <aside className="absolute md:static inset-y-0 right-0 w-full sm:w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shrink-0 overflow-y-auto z-20">
            <InfoPanel
              sheet={sheet} revision={revision} revisions={revisions}
              viewRevisionId={viewRevisionId} isSuperseded={isSuperseded}
              onViewRevision={(id) => { setViewRevisionId(id); setCompareRevId(null) }}
              onCompare={(id) => setCompareRevId(id)}
              onMakeCurrent={canManage ? async (revId) => {
                const res = await setCurrentRevision(projectId, sheet.id, revId)
                if (res.success) {
                  setRevisions((rs) => rs.map((r) => ({ ...r, status: r.id === revId ? 'current' : 'superseded' })))
                  setViewRevisionId(null)
                  notify('Revision set as current')
                } else notify(res.error)
              } : undefined}
              pins={pins} onOpenPin={openPin}
              showResolvedPins={showResolvedPins} onToggleResolvedPins={() => setShowResolvedPins((s) => !s)}
              offline={offline} onToggleOffline={toggleOffline}
              onClose={() => setInfoOpen(false)}
              onDeleteSheet={isAdmin ? async () => {
                if (!window.confirm(`Permanently delete ${sheet.sheet_number} and all of its revisions? This cannot be undone.`)) return
                const res = await deleteSheets(projectId, [sheet.id])
                if (res.success) {
                  persistView(sheetId)
                  router.push(`/app/projects/${projectId}/plans`)
                } else notify(res.error)
              } : undefined}
            />
          </aside>
        )}
      </div>

      {/* ── Mobile bottom bar ── */}
      <nav className={cn(
        'md:hidden flex items-stretch bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shrink-0 z-30 transition-transform',
        chromeHidden && 'translate-y-full absolute inset-x-0 bottom-0',
      )}>
        <MobileTab icon={<PanelLeft size={18} />} label="Sheets" onClick={() => setDrawerOpen(true)} />
        {canMarkup && <MobileTab icon={<PenLine size={18} />} label="Markup" active={markupOpen} onClick={() => setMarkupOpen((o) => !o)} />}
        <MobileTab icon={<Download size={18} />} label="Download" onClick={downloadCurrent} />
        <MobileTab icon={<Link2 size={18} />} label="Link" onClick={copyLink} />
        <MobileTab icon={<MoreHorizontal size={18} />} label="More" active={infoOpen} onClick={() => setInfoOpen((o) => !o)} />
      </nav>

      {/* ── Mobile sheet drawer ── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false) }}>
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl max-h-[78vh] flex flex-col">
            <div className="flex justify-center py-2 shrink-0" onClick={() => setDrawerOpen(false)}>
              <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>
            <SheetSidebar sheets={ordered} currentSheetId={sheet.id} onSelect={goToSheet}
              autoFocusSearch={false} className="bg-white dark:bg-slate-900 min-h-0" />
          </div>
        </div>
      )}

      {/* ── Pin thread popup ── */}
      {activePin && (
        <PinPopup
          pin={activePin} comments={pinComments} members={members}
          onClose={() => setActivePin(null)}
          onComment={async (body) => {
            const res = await addPinComment(activePin.id, body)
            if (res.success) setPinComments((cs) => [...cs, {
              id: crypto.randomUUID(), company_id: activePin.company_id, pin_id: activePin.id,
              author_id: currentUserId, body, photo_path: null,
              created_at: new Date().toISOString(), author_name: 'You',
            }])
            else notify(res.error)
          }}
          onSetStatus={async (status) => {
            const res = await setPinStatus(activePin.id, status)
            if (res.success) {
              setPins((ps) => ps.map((p) => p.id === activePin.id ? { ...p, status } : p))
              setActivePin((p) => p ? { ...p, status } : p)
            } else notify(res.error)
          }}
          onDelete={activePin.created_by === currentUserId || canManage ? async () => {
            const res = await deletePin(activePin.id)
            if (res.success) { setPins((ps) => ps.filter((p) => p.id !== activePin.id)); setActivePin(null) }
            else notify(res.error)
          } : undefined}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-0 flex justify-center z-[60] pointer-events-none">
          <span className="text-xs font-medium bg-slate-900 text-white rounded-full px-4 py-2 shadow-lg">{toast}</span>
        </div>
      )}
    </div>
  )
}

function revisionRotation(ref: React.RefObject<PlanCanvasHandle | null>): number {
  return ref.current?.getViewState().rotation ?? 0
}

function IconBtn({ children, title, onClick, active, disabled, className }: {
  children: React.ReactNode; title: string; onClick: () => void
  active?: boolean; disabled?: boolean; className?: string
}) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className={cn('p-2 rounded-lg transition-colors disabled:opacity-30',
        active ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
        className)}>
      {children}
    </button>
  )
}

function ToolBtn({ children, title, onClick, active, disabled }: {
  children: React.ReactNode; title: string; onClick: () => void; active?: boolean; disabled?: boolean
}) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className={cn('p-1.5 rounded-md shrink-0 transition-colors disabled:opacity-30',
        active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
      {children}
    </button>
  )
}

function FloatBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="pointer-events-auto p-2.5 rounded-full bg-white/95 dark:bg-slate-800/95 shadow-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-0">
      {children}
    </button>
  )
}

function MobileTab({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn('flex-1 flex flex-col items-center gap-0.5 py-2', active ? 'text-indigo-600' : 'text-slate-500')}>
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

// ─── Info panel ──────────────────────────────────────────────────────────────

function InfoPanel({
  sheet, revision, revisions, viewRevisionId, isSuperseded,
  onViewRevision, onCompare, onMakeCurrent, pins, onOpenPin,
  showResolvedPins, onToggleResolvedPins, offline, onToggleOffline, onClose, onDeleteSheet,
}: {
  sheet: SheetWithRevision
  revision: PlanRevision | null
  revisions: PlanRevision[]
  viewRevisionId: string | null
  isSuperseded: boolean
  onViewRevision: (id: string | null) => void
  onCompare: (id: string) => void
  onMakeCurrent?: (id: string) => void
  pins: PlanPin[]
  onOpenPin: (pin: PlanPin) => void
  showResolvedPins: boolean
  onToggleResolvedPins: () => void
  offline: boolean
  onToggleOffline: () => void
  onClose: () => void
  onDeleteSheet?: () => void
}) {
  const openPins = pins.filter((p) => p.status === 'open')
  return (
    <div className="p-4 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-bold font-mono text-slate-900 dark:text-white">{sheet.sheet_number}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{sheet.title || 'Untitled'}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <InfoRow label="Discipline" value={sheet.discipline} />
        <InfoRow label="Revision" value={revision ? `REV ${revision.revision_label}` : '—'} />
        <InfoRow label="Date" value={revision?.revision_date ? formatDate(revision.revision_date) : '—'} />
        <InfoRow label="Status" value={isSuperseded ? 'SUPERSEDED' : 'CURRENT'} accent={isSuperseded ? 'amber' : 'emerald'} />
        {sheet.floor && <InfoRow label="Floor" value={sheet.floor} />}
        {sheet.building && <InfoRow label="Building" value={sheet.building} />}
        <InfoRow label="Scale" value={revision?.scale_calibration ? `Calibrated (${revision.scale_calibration.unit})` : 'Not calibrated'} />
        <InfoRow label="Source" value={revision?.source_file_name ? `p.${revision.source_page_number}` : '—'} />
      </dl>
      {sheet.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sheet.tags.map((t) => (
            <span key={t} className="text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full px-2 py-0.5">{t}</span>
          ))}
        </div>
      )}

      <button onClick={onToggleOffline}
        className={cn('w-full flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium',
          offline ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')}>
        {offline ? <><Check size={14} /> Downloaded — available offline</> : <><CloudDownload size={14} /> Make available offline</>}
      </button>

      <section>
        <h3 className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-2">Revision history</h3>
        <div className="space-y-1">
          {revisions.map((r) => {
            const viewing = (viewRevisionId ?? revisions.find((x) => x.status === 'current')?.id) === r.id
            return (
              <div key={r.id} className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2',
                viewing ? 'border-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40' : 'border-slate-100 dark:border-slate-800')}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    REV {r.revision_label}
                    {r.status === 'current' && <CheckCircle2 size={12} className="text-emerald-500" />}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {r.revision_date ? formatDate(r.revision_date) : formatDate(r.created_at)}
                    {r.status !== 'current' && ' · superseded'}
                  </p>
                </div>
                {!viewing && (
                  <button className="text-[10px] font-medium text-indigo-600 hover:underline"
                    onClick={() => onViewRevision(r.status === 'current' ? null : r.id)}>View</button>
                )}
                {revisions.length > 1 && (
                  <button className="text-[10px] font-medium text-slate-500 hover:underline"
                    onClick={() => onCompare(r.id)}>Compare</button>
                )}
                {onMakeCurrent && r.status !== 'current' && (
                  <button className="text-[10px] font-medium text-amber-600 hover:underline"
                    onClick={() => { if (window.confirm(`Make REV ${r.revision_label} the current drawing?`)) onMakeCurrent(r.id) }}>
                    Make current
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Pins ({openPins.length} open)</h3>
          <button onClick={onToggleResolvedPins} className="text-[10px] text-slate-500 hover:underline">
            {showResolvedPins ? 'Hide resolved' : 'Show resolved'}
          </button>
        </div>
        {pins.length === 0 && <p className="text-xs text-slate-400">No pins on this sheet.</p>}
        <div className="space-y-1">
          {pins.filter((p) => showResolvedPins || p.status === 'open').map((p) => (
            <button key={p.id} onClick={() => onOpenPin(p)}
              className="w-full flex items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
              <MapPin size={13} className={p.status === 'resolved' ? 'text-emerald-500 mt-0.5' : 'text-rose-500 mt-0.5'} />
              <div className="min-w-0">
                <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-2">{p.note}</p>
                <p className="text-[10px] text-slate-400">{p.author_name ?? 'Unknown'} · {formatDate(p.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {onDeleteSheet && (
        <section className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onDeleteSheet}
            className="w-full rounded-lg border border-rose-200 text-rose-600 px-3 py-2 text-xs font-medium hover:bg-rose-50">
            Delete sheet & all revisions
          </button>
        </section>
      )}
    </div>
  )
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: 'amber' | 'emerald' }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</dt>
      <dd className={cn('text-xs font-medium',
        accent === 'amber' ? 'text-amber-600' : accent === 'emerald' ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200')}>
        {value}
      </dd>
    </div>
  )
}

// ─── Pin popup ───────────────────────────────────────────────────────────────

function PinPopup({ pin, comments, onClose, onComment, onSetStatus, onDelete }: {
  pin: PlanPin
  comments: PlanPinComment[]
  members: Member[]
  onClose: () => void
  onComment: (body: string) => Promise<void>
  onSetStatus: (status: 'open' | 'resolved') => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-start gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <MapPin size={16} className={pin.status === 'resolved' ? 'text-emerald-500 mt-0.5' : 'text-rose-500 mt-0.5'} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{pin.note}</p>
            <p className="text-[11px] text-slate-500">
              {pin.author_name ?? 'Unknown'} · {formatDate(pin.created_at)}
              {pin.assignee_name && ` · assigned to ${pin.assignee_name}`}
              {pin.due_date && ` · due ${formatDate(pin.due_date)}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {comments.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2">
              <p className="text-xs text-slate-700 dark:text-slate-200">{c.body}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{c.author_name ?? 'Unknown'} · {formatDate(c.created_at)}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex gap-2">
            <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…"
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && body.trim() && !busy) {
                  setBusy(true); await onComment(body.trim()); setBody(''); setBusy(false)
                }
              }} />
            <button disabled={!body.trim() || busy}
              onClick={async () => { setBusy(true); await onComment(body.trim()); setBody(''); setBusy(false) }}
              className="rounded-lg bg-indigo-600 text-white text-xs font-medium px-3 disabled:opacity-40">Send</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onSetStatus(pin.status === 'open' ? 'resolved' : 'open')}
              className={cn('flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium',
                pin.status === 'open'
                  ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800')}>
              {pin.status === 'open' ? 'Mark resolved' : 'Reopen'}
            </button>
            {onDelete && (
              <button onClick={() => { if (window.confirm('Delete this pin?')) onDelete() }}
                className="rounded-lg border border-rose-200 text-rose-600 px-3 py-1.5 text-xs font-medium hover:bg-rose-50">
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
