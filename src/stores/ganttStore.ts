'use client'

import { create } from 'zustand'
import { addDays, differenceInDays, getFitViewRange, getShiftDaysForZoom, getViewRange } from '@/lib/dates'
import { ZOOM_PIXELS_PER_DAY } from '@/lib/constants'
import { ZoomLevel } from '@/types/app'

export type ShiftMode = 'single' | 'cascade'
export type ColorMode = 'standard' | 'status' | 'none'

interface GanttState {
  zoom: ZoomLevel
  viewStart: Date
  viewEnd: Date
  pixelsPerDay: number
  selectedPhaseId: string | null
  selectedProjectId: string | null
  collapsedProjects: Set<string>
  shiftMode: ShiftMode
  colorMode: ColorMode
  setZoom: (zoom: ZoomLevel) => void
  setSelectedPhase: (id: string | null) => void
  setSelectedProject: (id: string | null) => void
  toggleProjectCollapse: (projectId: string) => void
  scrollToToday: () => void
  shiftView: (direction: 'backward' | 'forward') => void
  setViewRange: (start: Date, end: Date) => void
  fitViewToRange: (start: Date, end: Date) => void
  setShiftMode: (mode: ShiftMode) => void
  setColorMode: (mode: ColorMode) => void
}

export const useGanttStore = create<GanttState>((set, get) => ({
  zoom: 'week',
  viewStart: getViewRange('week').start,
  viewEnd: getViewRange('week').end,
  pixelsPerDay: ZOOM_PIXELS_PER_DAY.week,
  selectedPhaseId: null,
  selectedProjectId: null,
  collapsedProjects: new Set(),
  shiftMode: 'single',
  colorMode: 'standard',

  setZoom: (zoom) => {
    const { viewStart, viewEnd } = get()
    const center = addDays(viewStart, Math.round(differenceInDays(viewEnd, viewStart) / 2))
    const { start, end } = getViewRange(zoom, center)

    set({
      zoom,
      viewStart: start,
      viewEnd: end,
      pixelsPerDay: ZOOM_PIXELS_PER_DAY[zoom],
    })
  },

  setSelectedPhase: (id) => set({ selectedPhaseId: id }),

  setSelectedProject: (id) => set({ selectedProjectId: id }),

  toggleProjectCollapse: (projectId) => {
    const collapsed = new Set(get().collapsedProjects)
    if (collapsed.has(projectId)) collapsed.delete(projectId)
    else collapsed.add(projectId)
    set({ collapsedProjects: collapsed })
  },

  scrollToToday: () => {
    const { zoom } = get()
    const { start, end } = getViewRange(zoom, new Date())
    set({ viewStart: start, viewEnd: end })
  },

  shiftView: (direction) => {
    const { zoom, viewStart, viewEnd } = get()
    const delta = getShiftDaysForZoom(zoom) * (direction === 'backward' ? -1 : 1)

    set({
      viewStart: addDays(viewStart, delta),
      viewEnd: addDays(viewEnd, delta),
    })
  },

  setViewRange: (start, end) => set({ viewStart: start, viewEnd: end }),

  fitViewToRange: (start, end) => {
    const { zoom } = get()
    const fitted = getFitViewRange(zoom, start, end)
    set({ viewStart: fitted.start, viewEnd: fitted.end })
  },

  setShiftMode: (mode) => set({ shiftMode: mode }),

  setColorMode: (mode) => set({ colorMode: mode }),
}))
