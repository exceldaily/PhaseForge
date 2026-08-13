'use client'

// SVG markup layer. Elements live in normalized page coordinates (0..1 on the
// un-rotated sheet) so they survive zoom, rotation and re-renders, and they
// are stored as data — the drawing PDF itself is never modified.

import { useCallback, useRef, useState } from 'react'
import type { MarkupElement, MarkupTool } from '@/types/plans'
import type { ViewTransform } from './PlanCanvas'

interface MarkupLayerProps {
  t: ViewTransform
  elements: MarkupElement[]
  /** Elements from other layers shown read-only (e.g. project layer while editing personal). */
  backgroundElements?: MarkupElement[]
  activeTool: MarkupTool | null
  color: string
  calibration: { pointsPerUnit: number; unit: 'ft' | 'm' } | null
  onCommit: (el: MarkupElement) => void
  onSelectElement?: (id: string | null) => void
  selectedId?: string | null
  /** Calibration capture mode: next two clicks define a known distance. */
  calibrating?: boolean
  onCalibrationPoints?: (a: { x: number; y: number }, b: { x: number; y: number }) => void
}

export function MarkupLayer({
  t, elements, backgroundElements = [], activeTool, color, calibration,
  onCommit, onSelectElement, selectedId, calibrating, onCalibrationPoints,
}: MarkupLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<MarkupElement | null>(null)
  const drawing = useRef(false)
  const calibFirst = useRef<{ x: number; y: number } | null>(null)

  const toPagePt = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return t.toPage(e.clientX - rect.left, e.clientY - rect.top)
  }, [t])

  const strokeW = 0.0018 // normalized default; scaled by displayW on render

  const onPointerDown = (e: React.PointerEvent) => {
    if (calibrating) {
      const p = toPagePt(e)
      if (!calibFirst.current) { calibFirst.current = p }
      else { onCalibrationPoints?.(calibFirst.current, p); calibFirst.current = null }
      e.stopPropagation()
      return
    }
    if (!activeTool) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = toPagePt(e)
    drawing.current = true
    if (activeTool === 'text') {
      const text = window.prompt('Text')
      if (text?.trim()) {
        onCommit({
          id: crypto.randomUUID(), type: 'text', points: [p], color,
          strokeWidth: strokeW, text: text.trim(), fontSize: 0.012,
        })
      }
      drawing.current = false
      return
    }
    setDraft({
      id: crypto.randomUUID(),
      type: activeTool,
      points: [p, p],
      color,
      strokeWidth: activeTool === 'highlight' ? 0.012 : strokeW,
      opacity: activeTool === 'highlight' ? 0.35 : 1,
    })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) return
    e.stopPropagation()
    const p = toPagePt(e)
    setDraft((d) => {
      if (!d) return d
      if (d.type === 'freehand' || d.type === 'highlight') {
        const last = d.points[d.points.length - 1]
        if (Math.hypot(p.x - last.x, p.y - last.y) < 0.0015) return d
        return { ...d, points: [...d.points, p] }
      }
      return { ...d, points: [d.points[0], p] }
    })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) { drawing.current = false; return }
    e.stopPropagation()
    drawing.current = false
    const d = draft
    setDraft(null)
    const [a, b] = [d.points[0], d.points[d.points.length - 1]]
    const tiny = Math.hypot(b.x - a.x, b.y - a.y) < 0.004 && d.points.length <= 2
    if (tiny) return
    onCommit(d)
  }

  const all: { el: MarkupElement; bg: boolean }[] = [
    ...backgroundElements.map((el) => ({ el, bg: true })),
    ...elements.map((el) => ({ el, bg: false })),
    ...(draft ? [{ el: draft, bg: false }] : []),
  ]

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: activeTool || calibrating ? 'auto' : 'none', cursor: 'crosshair' }}
      viewBox={`0 0 ${t.displayW} ${t.displayH}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {all.map(({ el, bg }) => (
        <MarkupShape key={el.id} el={el} t={t} calibration={calibration} dim={bg}
          selected={selectedId === el.id}
          onClick={!bg && onSelectElement ? () => onSelectElement(el.id) : undefined} />
      ))}
    </svg>
  )
}

function MarkupShape({ el, t, calibration, dim, selected, onClick }: {
  el: MarkupElement; t: ViewTransform
  calibration: { pointsPerUnit: number; unit: 'ft' | 'm' } | null
  dim?: boolean; selected?: boolean; onClick?: () => void
}) {
  const pts = el.points.map((p) => t.toScreen(p.x, p.y))
  const sw = Math.max(1, el.strokeWidth * t.displayW)
  const common = {
    stroke: el.color,
    strokeWidth: selected ? sw * 1.6 : sw,
    fill: 'none',
    opacity: (el.opacity ?? 1) * (dim ? 0.55 : 1),
    style: { pointerEvents: onClick ? ('stroke' as const) : ('none' as const), cursor: 'pointer' },
    onClick,
  }
  if (pts.length === 0) return null

  switch (el.type) {
    case 'line':
      return <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} {...common} strokeLinecap="round" />
    case 'arrow': {
      const [a, b] = [pts[0], pts[1]]
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const head = Math.max(8, sw * 4)
      const p1 = { x: b.x - head * Math.cos(ang - 0.45), y: b.y - head * Math.sin(ang - 0.45) }
      const p2 = { x: b.x - head * Math.cos(ang + 0.45), y: b.y - head * Math.sin(ang + 0.45) }
      return (
        <g {...common}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeLinecap="round" />
          <path d={`M ${p1.x} ${p1.y} L ${b.x} ${b.y} L ${p2.x} ${p2.y}`} strokeLinejoin="round" />
        </g>
      )
    }
    case 'rect': {
      const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y)
      return <rect x={x} y={y} width={Math.abs(pts[1].x - pts[0].x)} height={Math.abs(pts[1].y - pts[0].y)} rx={2} {...common} />
    }
    case 'ellipse': {
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2
      return <ellipse cx={cx} cy={cy} rx={Math.abs(pts[1].x - pts[0].x) / 2} ry={Math.abs(pts[1].y - pts[0].y) / 2} {...common} />
    }
    case 'cloud':
      return <path d={cloudPath(pts[0], pts[el.points.length - 1], sw)} {...common} strokeLinejoin="round" />
    case 'freehand':
    case 'highlight':
      return <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} {...common}
        strokeLinecap="round" strokeLinejoin="round" />
    case 'text': {
      const fs = Math.max(10, (el.fontSize ?? 0.012) * t.displayW)
      return (
        <text x={pts[0].x} y={pts[0].y} fontSize={fs} fill={el.color} fontWeight={600}
          opacity={dim ? 0.55 : 1} style={{ pointerEvents: onClick ? 'auto' : 'none', cursor: 'pointer' }}
          onClick={onClick} paintOrder="stroke" stroke="#ffffff" strokeWidth={fs / 8}>
          {el.text}
        </text>
      )
    }
    case 'measure': {
      const [a, b] = [pts[0], pts[1]]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const label = measureLabel(el, t, calibration)
      const fs = Math.max(11, 0.011 * t.displayW)
      return (
        <g>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} strokeDasharray={`${sw * 3} ${sw * 2}`} />
          <circle cx={a.x} cy={a.y} r={sw * 1.5} fill={el.color} opacity={dim ? 0.55 : 1} style={{ pointerEvents: 'none' }} />
          <circle cx={b.x} cy={b.y} r={sw * 1.5} fill={el.color} opacity={dim ? 0.55 : 1} style={{ pointerEvents: 'none' }} />
          <text x={mid.x} y={mid.y - fs * 0.5} fontSize={fs} fill={el.color} fontWeight={700} textAnchor="middle"
            paintOrder="stroke" stroke="#ffffff" strokeWidth={fs / 7} style={{ pointerEvents: onClick ? 'auto' : 'none' }} onClick={onClick}>
            {label}
          </text>
        </g>
      )
    }
    default:
      return null
  }
}

function measureLabel(
  el: MarkupElement, t: ViewTransform,
  calibration: { pointsPerUnit: number; unit: 'ft' | 'm' } | null,
): string {
  const [a, b] = [el.points[0], el.points[el.points.length - 1]]
  const dxPts = (b.x - a.x) * t.pageWidth
  const dyPts = (b.y - a.y) * t.pageHeight
  const distPts = Math.hypot(dxPts, dyPts)
  if (!calibration) return 'Not calibrated'
  const units = distPts / calibration.pointsPerUnit
  if (calibration.unit === 'ft') {
    const feet = Math.floor(units)
    const inches = Math.round((units - feet) * 12)
    return inches === 12 ? `${feet + 1}'-0"` : `${feet}'-${inches}"`
  }
  return `${units.toFixed(2)} m`
}

/** Revision-cloud path: scalloped arcs around the bounding rectangle. */
function cloudPath(a: { x: number; y: number }, b: { x: number; y: number }, sw: number): string {
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
  const w = x1 - x0, h = y1 - y0
  if (w < 4 || h < 4) return ''
  const r = Math.max(6, Math.min(18, sw * 6, w / 3, h / 3))
  let d = `M ${x0} ${y0}`
  const seg = (fromX: number, fromY: number, toX: number, toY: number) => {
    const len = Math.hypot(toX - fromX, toY - fromY)
    const n = Math.max(1, Math.round(len / (r * 1.6)))
    for (let i = 1; i <= n; i++) {
      const px = fromX + ((toX - fromX) * i) / n
      const py = fromY + ((toY - fromY) * i) / n
      d += ` A ${r * 0.8} ${r * 0.8} 0 0 1 ${px} ${py}`
    }
  }
  seg(x0, y0, x1, y0); seg(x1, y0, x1, y1); seg(x1, y1, x0, y1); seg(x0, y1, x0, y0)
  return d + ' Z'
}
