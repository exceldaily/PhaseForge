import {
  format, parseISO, differenceInDays, addDays,
  startOfWeek, startOfMonth, startOfQuarter,
  endOfWeek, endOfMonth, endOfQuarter,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  isToday, isBefore, isAfter, isWeekend,
} from 'date-fns'
import { ZoomLevel } from '@/types/app'

export function toDate(dateStr: string): Date {
  return parseISO(dateStr)
}

export function formatDate(date: Date | string, fmt = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt)
}

export function daysBetween(start: Date | string, end: Date | string): number {
  const s = typeof start === 'string' ? parseISO(start) : start
  const e = typeof end === 'string' ? parseISO(end) : end
  return differenceInDays(e, s)
}

export function getViewRange(zoom: ZoomLevel, anchor: Date = new Date()): { start: Date; end: Date } {
  switch (zoom) {
    case 'day':
      return { start: addDays(anchor, -7), end: addDays(anchor, 30) }
    case 'week':
      return { start: startOfWeek(addDays(anchor, -14)), end: endOfWeek(addDays(anchor, 90)) }
    case 'month':
      return { start: startOfMonth(addDays(anchor, -30)), end: endOfMonth(addDays(anchor, 180)) }
    case 'quarter':
      return { start: startOfQuarter(addDays(anchor, -90)), end: endOfQuarter(addDays(anchor, 365)) }
  }
}

export function getShiftDaysForZoom(zoom: ZoomLevel): number {
  switch (zoom) {
    case 'day':
      return 14
    case 'week':
      return 28
    case 'month':
      return 60
    case 'quarter':
      return 120
  }
}

export function getFitViewRange(
  zoom: ZoomLevel,
  minDate: Date,
  maxDate: Date
): { start: Date; end: Date } {
  switch (zoom) {
    case 'day':
      return {
        start: addDays(minDate, -5),
        end: addDays(maxDate, 10),
      }
    case 'week':
      return {
        start: startOfWeek(addDays(minDate, -14)),
        end: endOfWeek(addDays(maxDate, 21)),
      }
    case 'month':
      return {
        start: startOfMonth(addDays(minDate, -45)),
        end: endOfMonth(addDays(maxDate, 45)),
      }
    case 'quarter':
      return {
        start: startOfQuarter(addDays(minDate, -60)),
        end: endOfQuarter(addDays(maxDate, 120)),
      }
  }
}

export function getBarPosition(
  phaseStart: string,
  phaseEnd: string,
  viewStart: Date,
  pixelsPerDay: number
): { left: number; width: number } {
  const start = parseISO(phaseStart)
  const end = parseISO(phaseEnd)
  const left = differenceInDays(start, viewStart) * pixelsPerDay
  const width = Math.max((differenceInDays(end, start) + 1) * pixelsPerDay, pixelsPerDay)
  return { left, width }
}

export function getDateFromPixel(pixel: number, viewStart: Date, pixelsPerDay: number): Date {
  const days = Math.round(pixel / pixelsPerDay)
  return addDays(viewStart, days)
}

export function getTimelineHeaders(zoom: ZoomLevel, viewStart: Date, viewEnd: Date) {
  switch (zoom) {
    case 'day':
      return eachDayOfInterval({ start: viewStart, end: viewEnd }).map(d => ({
        date: d,
        label: format(d, 'EEE d'),
        isToday: isToday(d),
        isWeekend: isWeekend(d),
      }))
    case 'week':
      return eachWeekOfInterval({ start: viewStart, end: viewEnd }).map(d => ({
        date: startOfWeek(d),
        label: `Week of ${format(startOfWeek(d), 'MMM d')}`,
        isToday: false,
        isWeekend: false,
      }))
    case 'month':
    case 'quarter':
      return eachMonthOfInterval({ start: viewStart, end: viewEnd }).map(d => ({
        date: startOfMonth(d),
        label: format(startOfMonth(d), 'MMM yyyy'),
        isToday: false,
        isWeekend: false,
      }))
  }
}

export function isOverdue(endDate: string, status: string): boolean {
  if (status === 'completed' || status === 'cancelled' || status === 'skipped') return false
  return isBefore(parseISO(endDate), new Date())
}

export { format, parseISO, addDays, isToday, isBefore, isAfter, differenceInDays }
