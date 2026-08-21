'use client'

// Drag-to-reorder for the schedule's job rows, in both layouts.
//
// Hand-rolled on pointer events rather than HTML5 drag-and-drop, which does
// not fire at all on a phone or tablet. Pointer capture keeps the whole drag
// on the grip, so it works the same with a mouse, a finger, or a stylus, and
// only the grip locks touch-action — dragging anywhere else still scrolls.

import { useCallback, useRef, useState } from 'react'

export interface Reorderable { id: string }

export interface RowReorder<T extends Reorderable> {
  /** Items in the order to render right now (live during a drag). */
  ordered: T[]
  /** Id of the row being dragged, for styling. */
  dragId: string | null
  /** ref callback for the row element, so the hook can measure it. */
  rowRef: (id: string) => (el: HTMLElement | null) => void
  /** Spread onto the grip handle. */
  handleProps: (id: string) => {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
    style: React.CSSProperties
  }
}

/** Nearest ancestor that actually scrolls vertically, for edge auto-scroll. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return null
}

const EDGE = 56      // px from the edge where auto-scroll kicks in
const SPEED = 12     // px per frame at the very edge

export function useRowReorder<T extends Reorderable>(
  items: T[],
  onCommit: (ids: string[]) => void,
  enabled = true,
): RowReorder<T> {
  const [orderIds, setOrderIds] = useState<string[]>(() => items.map((i) => i.id))
  const [dragId, setDragId] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())
  const startOrder = useRef<string[]>([])
  const pointerY = useRef(0)
  const scroller = useRef<HTMLElement | null>(null)
  const raf = useRef(0)

  // Re-sync when the server hands back a different SET of jobs (week change,
  // add, delete). Keyed on the sorted ids so committing a reorder — same set,
  // new order — never snaps our arrangement back.
  const key = [...items.map((i) => i.id)].sort().join(',')
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    setOrderIds(items.map((i) => i.id))
  }

  const byId = new Map(items.map((i) => [i.id, i]))
  const ordered = orderIds.map((id) => byId.get(id)).filter((i): i is T => !!i)

  const rowRef = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(id, el)
    else rows.current.delete(id)
  }, [])

  // Move the dragged row to whichever row currently sits under the pointer.
  // Rows are re-measured every time: after a swap the DOM has already
  // reflowed, so the next comparison uses the positions actually on screen.
  const repositionTo = (y: number, id: string) => {
    setOrderIds((cur) => {
      const from = cur.indexOf(id)
      if (from < 0) return cur
      let to = from
      for (let i = 0; i < cur.length; i++) {
        const el = rows.current.get(cur[i])
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (y >= r.top && y <= r.bottom) { to = i; break }
      }
      if (to === from) return cur
      const next = [...cur]
      next.splice(from, 1)
      next.splice(to, 0, id)
      return next
    })
  }

  const stopAutoScroll = () => { cancelAnimationFrame(raf.current); raf.current = 0 }

  // A finger parked at the top or bottom edge keeps scrolling, which is the
  // only way to drag a row past the fold on a phone.
  const autoScroll = (id: string) => {
    const tick = () => {
      const box = scroller.current
      const y = pointerY.current
      if (box) {
        const r = box.getBoundingClientRect()
        const up = y - r.top, down = r.bottom - y
        let dy = 0
        if (up < EDGE) dy = -SPEED * Math.min(1, (EDGE - up) / EDGE)
        else if (down < EDGE) dy = SPEED * Math.min(1, (EDGE - down) / EDGE)
        if (dy) { box.scrollTop += dy; repositionTo(y, id) }
      }
      raf.current = requestAnimationFrame(tick)
    }
    stopAutoScroll()
    raf.current = requestAnimationFrame(tick)
  }

  const finish = (e: React.PointerEvent, commit: boolean) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    stopAutoScroll()
    if (!dragId) return
    setDragId(null)
    const before = startOrder.current
    if (!commit) { setOrderIds(before); return }
    if (orderIds.length === before.length && orderIds.every((v, i) => v === before[i])) return
    onCommit(orderIds)
  }

  const handleProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (!enabled) return
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      startOrder.current = orderIds
      pointerY.current = e.clientY
      scroller.current = scrollParent(rows.current.get(id) ?? null)
      setDragId(id)
      autoScroll(id)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!dragId) return
      pointerY.current = e.clientY
      repositionTo(e.clientY, dragId)
    },
    onPointerUp: (e: React.PointerEvent) => finish(e, true),
    onPointerCancel: (e: React.PointerEvent) => finish(e, false),
    // Only the grip refuses touch panning; the rest of the row still scrolls.
    style: { touchAction: 'none' as const, cursor: enabled ? 'grab' : 'default' },
  })

  return { ordered, dragId, rowRef, handleProps }
}
