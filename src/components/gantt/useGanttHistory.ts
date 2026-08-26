'use client'

// Undo / redo for the Gantt.
//
// Covers the edits you make by dragging on the chart itself — moving a bar,
// resizing it, a cascade that shifted every later phase with it, and the
// inline percent handle. Those are the ones that go wrong by accident, and
// they are all reversible to an exact previous value.
//
// Each entry stores both sides of the change, so undo and redo are the same
// operation pointed in opposite directions. Nothing is inferred or replayed:
// undo writes the recorded "before" values, never a computed inverse.

import { useCallback, useRef, useState } from 'react'

export interface PhaseDateChange {
  id: string
  from: { start: string; end: string }
  to: { start: string; end: string }
}

export interface PhasePercentChange {
  id: string
  from: number
  to: number
}

export type GanttEdit =
  | { kind: 'dates'; label: string; projectId: string; phases: PhaseDateChange[] }
  | { kind: 'percent'; label: string; projectId: string; phases: PhasePercentChange[] }

/** Which side of a recorded change to write. */
export type EditDirection = 'undo' | 'redo'

/** Applies one side of an edit. Returns false when it could not be applied. */
export type ApplyEdit = (edit: GanttEdit, direction: EditDirection) => Promise<boolean>

const LIMIT = 50

export interface GanttHistory {
  canUndo: boolean
  canRedo: boolean
  /** What the next undo would reverse, for the button tooltip. */
  undoLabel: string | null
  redoLabel: string | null
  busy: boolean
  push: (edit: GanttEdit) => void
  undo: () => void
  redo: () => void
  clear: () => void
}

export function useGanttHistory(apply: ApplyEdit): GanttHistory {
  const [past, setPast] = useState<GanttEdit[]>([])
  const [future, setFuture] = useState<GanttEdit[]>([])
  const [busy, setBusy] = useState(false)
  // Guards against a held-down Ctrl+Z firing a second undo mid-write, which
  // would read stale dates and record the wrong "before".
  const running = useRef(false)

  const push = useCallback((edit: GanttEdit) => {
    if (!edit.phases.length) return
    setPast((cur) => [...cur, edit].slice(-LIMIT))
    // A fresh edit forks the timeline; anything that was undone is gone.
    setFuture([])
  }, [])

  const step = useCallback((direction: EditDirection) => {
    if (running.current) return
    const takeFrom = direction === 'undo' ? past : future
    const edit = takeFrom[takeFrom.length - 1]
    if (!edit) return

    running.current = true
    setBusy(true)
    void (async () => {
      const ok = await apply(edit, direction)
      if (direction === 'undo') {
        setPast((cur) => cur.slice(0, -1))
        // A failed undo still leaves the stack, or the entry would be stranded
        // with no way to reach it again.
        if (ok) setFuture((cur) => [...cur, edit].slice(-LIMIT))
      } else {
        setFuture((cur) => cur.slice(0, -1))
        if (ok) setPast((cur) => [...cur, edit].slice(-LIMIT))
      }
      running.current = false
      setBusy(false)
    })()
  }, [apply, past, future])

  const undo = useCallback(() => step('undo'), [step])
  const redo = useCallback(() => step('redo'), [step])
  const clear = useCallback(() => { setPast([]); setFuture([]) }, [])

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past.length ? past[past.length - 1].label : null,
    redoLabel: future.length ? future[future.length - 1].label : null,
    busy,
    push,
    undo,
    redo,
    clear,
  }
}
