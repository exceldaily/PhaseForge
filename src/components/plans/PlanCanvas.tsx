'use client'

// The drawing canvas: a purpose-built pan/zoom PDF surface.
//
// Model: one absolutely-positioned "stage" div sized to the page at the
// current scale, holding the rendered canvas plus overlay layers. Pan/zoom
// only move/resize the stage (cheap), while a debounced re-render repaints
// the canvas at the settled scale so linework stays crisp. Between renders
// the old raster is CSS-stretched — fluid first, sharp a beat later.
//
// Input: wheel zoom (cursor-anchored), pinch zoom, one-finger/mouse pan,
// double-tap/click zoom. All gestures are pointer events, so mouse, touch
// and pen behave identically.

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdf } from '@/lib/plans/pdf'
import { downloadPlanFile } from '@/lib/plans/storage'
import type { PlanViewState } from '@/types/plans'

export type Rotation = 0 | 90 | 180 | 270

export interface ViewTransform {
  /** CSS pixels per PDF point at current zoom. */
  scale: number
  displayW: number
  displayH: number
  rotation: Rotation
  /** Normalized (0..1, unrotated page space) → stage-local CSS px. */
  toScreen: (nx: number, ny: number) => { x: number; y: number }
  /** Stage-local CSS px → normalized unrotated page coords. */
  toPage: (sx: number, sy: number) => { x: number; y: number }
  pageWidth: number
  pageHeight: number
}

export interface PlanCanvasHandle {
  zoomBy: (factor: number) => void
  fitPage: () => void
  fitWidth: () => void
  zoomTo: (pct: number) => void
  setRotation: (r: Rotation) => void
  getViewState: () => PlanViewState
  applyViewState: (v: PlanViewState) => void
  getScalePct: () => number
}

interface PlanCanvasProps {
  pdfPath: string
  /** Second document rendered under the same transform (overlay compare). */
  overlayPdfPath?: string | null
  overlayOpacity?: number
  /** When a markup tool is active the canvas stops treating drags as pans. */
  interactionMode?: 'navigate' | 'draw'
  onViewChange?: (t: ViewTransform) => void
  onScaleChange?: (pct: number) => void
  onSingleTap?: (page: { x: number; y: number }) => void
  onError?: (message: string) => void
  onReady?: () => void
  initialView?: PlanViewState | null
  children?: (t: ViewTransform) => React.ReactNode
  className?: string
}

const MIN_SCALE_FACTOR = 0.2   // relative to fit
const MAX_SCALE = 24           // px per PDF point — plenty for E-size detail work
const RENDER_DEBOUNCE = 200
const MAX_CANVAS_PIXELS = 22_000_000

export const PlanCanvas = forwardRef<PlanCanvasHandle, PlanCanvasProps>(function PlanCanvas({
  pdfPath, overlayPdfPath, overlayOpacity = 0.5, interactionMode = 'navigate',
  onViewChange, onScaleChange, onSingleTap, onError, onReady, initialView, children, className,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)

  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const overlayPdfRef = useRef<PDFDocumentProxy | null>(null)
  const [pageDims, setPageDims] = useState<{ w: number; h: number } | null>(null)
  const [rotation, setRotationState] = useState<Rotation>(initialView?.rotation ?? 0)

  // View state lives in refs (mutated at gesture speed), mirrored to React
  // state only for the stage style + overlay children.
  const viewRef = useRef({ scale: 0, x: 0, y: 0 })
  const [, forceRender] = useState(0)
  const bump = () => forceRender((n) => n + 1)

  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderedScale = useRef(0)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const destroyed = useRef(false)

  const rotatedDims = useCallback((w: number, h: number) => {
    return rotation % 180 === 0 ? { w, h } : { w: h, h: w }
  }, [rotation])

  const fitScale = useCallback(() => {
    const el = containerRef.current
    if (!el || !pageDims) return 1
    const { w, h } = rotatedDims(pageDims.w, pageDims.h)
    return Math.min(el.clientWidth / w, el.clientHeight / h) * 0.98
  }, [pageDims, rotatedDims])

  const clampScale = useCallback((s: number) => {
    return Math.min(MAX_SCALE, Math.max(fitScale() * MIN_SCALE_FACTOR, s))
  }, [fitScale])

  // ── Document loading ──
  useEffect(() => {
    destroyed.current = false
    let cancelled = false
    ;(async () => {
      try {
        const buf = await downloadPlanFile(pdfPath)
        if (cancelled) return
        const pdf = await loadPdf(buf)
        if (cancelled) { pdf.loadingTask.destroy(); return }
        pdfRef.current = pdf
        const page = await pdf.getPage(1)
        const vp = page.getViewport({ scale: 1 })
        setPageDims({ w: vp.width, h: vp.height })
        onReady?.()
      } catch (e) {
        if (!cancelled) onError?.(e instanceof Error ? e.message : 'Could not load this drawing')
      }
    })()
    return () => {
      cancelled = true
      destroyed.current = true
      renderTaskRef.current?.cancel()
      pdfRef.current?.loadingTask.destroy()
      pdfRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath])

  useEffect(() => {
    let cancelled = false
    if (!overlayPdfPath) {
      overlayPdfRef.current?.loadingTask.destroy()
      overlayPdfRef.current = null
      return
    }
    ;(async () => {
      try {
        const buf = await downloadPlanFile(overlayPdfPath)
        if (cancelled) return
        const pdf = await loadPdf(buf)
        if (cancelled) { pdf.loadingTask.destroy(); return }
        overlayPdfRef.current = pdf
        scheduleRender(0)
      } catch { /* overlay is best-effort */ }
    })()
    return () => { cancelled = true; overlayPdfRef.current?.loadingTask.destroy(); overlayPdfRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayPdfPath])

  // ── Initial placement once dims are known ──
  useEffect(() => {
    if (!pageDims || !containerRef.current) return
    const el = containerRef.current
    const fs = fitScale()
    if (initialView && initialView.zoom > 0) {
      const s = clampScale(fs * initialView.zoom)
      const { w, h } = rotatedDims(pageDims.w, pageDims.h)
      const pt = rotatePoint(initialView.cx, initialView.cy, rotation)
      viewRef.current = {
        scale: s,
        x: el.clientWidth / 2 - pt.x * w * s,
        y: el.clientHeight / 2 - pt.y * h * s,
      }
    } else {
      const { w, h } = rotatedDims(pageDims.w, pageDims.h)
      viewRef.current = {
        scale: fs,
        x: (el.clientWidth - w * fs) / 2,
        y: (el.clientHeight - h * fs) / 2,
      }
    }
    bump()
    scheduleRender(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageDims, rotation])

  // ── Rendering ──
  const renderNow = useCallback(async () => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    if (!pdf || !canvas || !pageDims || destroyed.current) return
    const scale = viewRef.current.scale
    const dpr = window.devicePixelRatio || 1
    let renderScale = scale * dpr
    const { w, h } = rotatedDims(pageDims.w, pageDims.h)
    const projected = w * renderScale * h * renderScale
    if (projected > MAX_CANVAS_PIXELS) renderScale *= Math.sqrt(MAX_CANVAS_PIXELS / projected)
    try {
      renderTaskRef.current?.cancel()
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: renderScale, rotation: (page.rotate + rotation) % 360 })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d', { alpha: false })!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const task = page.render({ canvasContext: ctx, viewport, canvas })
      renderTaskRef.current = task
      await task.promise
      renderedScale.current = scale

      const opdf = overlayPdfRef.current
      const ocanvas = overlayCanvasRef.current
      if (opdf && ocanvas) {
        const opage = await opdf.getPage(1)
        const ovp = opage.getViewport({ scale: renderScale, rotation: (opage.rotate + rotation) % 360 })
        ocanvas.width = Math.ceil(ovp.width)
        ocanvas.height = Math.ceil(ovp.height)
        const octx = ocanvas.getContext('2d', { alpha: false })!
        octx.fillStyle = '#ffffff'
        octx.fillRect(0, 0, ocanvas.width, ocanvas.height)
        await opage.render({ canvasContext: octx, viewport: ovp, canvas: ocanvas }).promise
      }
    } catch (e) {
      // RenderingCancelledException is normal during fast interaction
      if (e instanceof Error && !/cancel/i.test(e.name + e.message)) {
        onError?.(e.message)
      }
    }
  }, [pageDims, rotation, rotatedDims, onError])

  const scheduleRender = useCallback((delay = RENDER_DEBOUNCE) => {
    if (renderTimer.current) clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(() => { renderNow() }, delay)
  }, [renderNow])

  // ── Gestures ──
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startDist: number; startScale: number; moved: boolean; downAt: number } | null>(null)
  const lastTap = useRef(0)

  const applyZoom = useCallback((factor: number, cx: number, cy: number) => {
    const v = viewRef.current
    const ns = clampScale(v.scale * factor)
    const real = ns / v.scale
    viewRef.current = { scale: ns, x: cx - (cx - v.x) * real, y: cy - (cy - v.y) * real }
    bump()
    onScaleChange?.(Math.round((ns / fitScale()) * 100))
    scheduleRender()
  }, [clampScale, fitScale, onScaleChange, scheduleRender])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.008 : 0.0018))
      applyZoom(factor, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  const onPointerDown = (e: React.PointerEvent) => {
    const el = containerRef.current!
    el.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      gesture.current = { startDist: 0, startScale: viewRef.current.scale, moved: false, downAt: Date.now() }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startScale: viewRef.current.scale,
        moved: true,
        downAt: Date.now(),
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (g.startDist > 0) {
        const rect = containerRef.current!.getBoundingClientRect()
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
        const target = clampScale(g.startScale * (dist / g.startDist))
        applyZoom(target / viewRef.current.scale, mid.x, mid.y)
      }
      g.moved = true
    } else if (pointers.current.size === 1 && interactionMode === 'navigate') {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        viewRef.current = { ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy }
        if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true
        bump()
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size === 0 && g) {
      const quick = Date.now() - g.downAt < 280
      if (!g.moved && quick) {
        const now = Date.now()
        const rect = containerRef.current!.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        if (now - lastTap.current < 320) {
          // double tap/click: zoom in 2.2x at point, or reset to fit if already deep
          const fs = fitScale()
          if (viewRef.current.scale > fs * 3) fitPage()
          else applyZoom(2.2, px, py)
          lastTap.current = 0
        } else {
          lastTap.current = now
          const t = makeTransform()
          if (t && onSingleTap) {
            const stage = { x: px - viewRef.current.x, y: py - viewRef.current.y }
            onSingleTap(t.toPage(stage.x, stage.y))
          }
        }
      }
      gesture.current = null
    }
  }

  // ── Public controls ──
  const fitPage = useCallback(() => {
    const el = containerRef.current
    if (!el || !pageDims) return
    const fs = fitScale()
    const { w, h } = rotatedDims(pageDims.w, pageDims.h)
    viewRef.current = { scale: fs, x: (el.clientWidth - w * fs) / 2, y: (el.clientHeight - h * fs) / 2 }
    bump(); onScaleChange?.(100); scheduleRender(0)
  }, [pageDims, fitScale, rotatedDims, onScaleChange, scheduleRender])

  const fitWidth = useCallback(() => {
    const el = containerRef.current
    if (!el || !pageDims) return
    const { w } = rotatedDims(pageDims.w, pageDims.h)
    const s = clampScale((el.clientWidth / w) * 0.98)
    viewRef.current = { scale: s, x: (el.clientWidth - w * s) / 2, y: 12 }
    bump(); onScaleChange?.(Math.round((s / fitScale()) * 100)); scheduleRender(0)
  }, [pageDims, rotatedDims, clampScale, fitScale, onScaleChange, scheduleRender])

  const makeTransform = useCallback((): ViewTransform | null => {
    if (!pageDims) return null
    const { w, h } = rotatedDims(pageDims.w, pageDims.h)
    const s = viewRef.current.scale
    const displayW = w * s
    const displayH = h * s
    return {
      scale: s, displayW, displayH, rotation,
      pageWidth: pageDims.w, pageHeight: pageDims.h,
      toScreen: (nx, ny) => {
        const p = rotatePoint(nx, ny, rotation)
        return { x: p.x * displayW, y: p.y * displayH }
      },
      toPage: (sx, sy) => {
        const nx = sx / displayW
        const ny = sy / displayH
        return unrotatePoint(nx, ny, rotation)
      },
    }
  }, [pageDims, rotation, rotatedDims])

  useImperativeHandle(ref, (): PlanCanvasHandle => ({
    zoomBy: (factor) => {
      const el = containerRef.current
      if (!el) return
      applyZoom(factor, el.clientWidth / 2, el.clientHeight / 2)
    },
    fitPage,
    fitWidth,
    zoomTo: (pct) => {
      const el = containerRef.current
      if (!el) return
      const target = fitScale() * (pct / 100)
      applyZoom(target / viewRef.current.scale, el.clientWidth / 2, el.clientHeight / 2)
    },
    setRotation: (r) => setRotationState(r),
    getScalePct: () => Math.round((viewRef.current.scale / fitScale()) * 100),
    getViewState: () => {
      const el = containerRef.current
      const t = makeTransform()
      if (!el || !t) return { zoom: 1, cx: 0.5, cy: 0.5, rotation }
      const center = t.toPage(el.clientWidth / 2 - viewRef.current.x, el.clientHeight / 2 - viewRef.current.y)
      return {
        zoom: viewRef.current.scale / fitScale(),
        cx: clamp01(center.x), cy: clamp01(center.y), rotation,
      }
    },
    applyViewState: (v) => {
      setRotationState(v.rotation)
      const el = containerRef.current
      if (!el || !pageDims) return
      const s = clampScale(fitScale() * v.zoom)
      const { w, h } = rotatedDims(pageDims.w, pageDims.h)
      const pt = rotatePoint(v.cx, v.cy, v.rotation)
      viewRef.current = { scale: s, x: el.clientWidth / 2 - pt.x * w * s, y: el.clientHeight / 2 - pt.y * h * s }
      bump(); scheduleRender(0)
    },
  }), [applyZoom, fitPage, fitWidth, fitScale, clampScale, makeTransform, pageDims, rotation, rotatedDims, scheduleRender])

  // Re-fit on container resize (orientation change, panel collapse)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { bump(); scheduleRender() })
    ro.observe(el)
    return () => ro.disconnect()
  }, [scheduleRender])

  const t = makeTransform()
  useEffect(() => { if (t) onViewChange?.(t) })

  const stageStyle = useMemo(() => {
    if (!t) return { display: 'none' }
    return {
      transform: `translate3d(${viewRef.current.x}px, ${viewRef.current.y}px, 0)`,
      width: t.displayW,
      height: t.displayH,
    }
    // viewRef mutation is signalled through bump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.displayW, t?.displayH, viewRef.current.x, viewRef.current.y])

  return (
    <div
      ref={containerRef}
      // NB: no `relative` here — every mount passes `absolute inset-0` and the
      // conflicting position utilities collapsed the container to zero height.
      className={`overflow-hidden bg-slate-200 dark:bg-slate-800 touch-none select-none ${className ?? 'relative'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: interactionMode === 'draw' ? 'crosshair' : 'grab' }}
    >
      {!pageDims && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
        </div>
      )}
      <div className="absolute top-0 left-0 will-change-transform shadow-xl" style={stageStyle}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {overlayPdfPath && (
          <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ opacity: overlayOpacity, mixBlendMode: 'multiply' }} />
        )}
        {t && children?.(t)}
      </div>
    </div>
  )
})

function rotatePoint(x: number, y: number, r: Rotation): { x: number; y: number } {
  switch (r) {
    case 90:  return { x: 1 - y, y: x }
    case 180: return { x: 1 - x, y: 1 - y }
    case 270: return { x: y, y: 1 - x }
    default:  return { x, y }
  }
}
function unrotatePoint(x: number, y: number, r: Rotation): { x: number; y: number } {
  switch (r) {
    case 90:  return { x: y, y: 1 - x }
    case 180: return { x: 1 - x, y: 1 - y }
    case 270: return { x: 1 - y, y: x }
    default:  return { x, y }
  }
}
function clamp01(n: number) { return Math.min(1, Math.max(0, n)) }
