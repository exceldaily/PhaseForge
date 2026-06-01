import { differenceInDays, parseISO } from '@/lib/dates'

export function getClippedBarPosition(
  startDate: string,
  endDate: string,
  viewStart: Date,
  viewEnd: Date,
  pixelsPerDay: number
) {
  const startOffset = differenceInDays(parseISO(startDate), viewStart) * pixelsPerDay
  const endOffset = (differenceInDays(parseISO(endDate), viewStart) + 1) * pixelsPerDay
  const chartWidth = (differenceInDays(viewEnd, viewStart) + 1) * pixelsPerDay
  const left = Math.max(0, startOffset)
  const right = Math.min(chartWidth, endOffset)

  return {
    left,
    width: Math.max(0, right - left),
    clippedStart: startOffset < 0,
    clippedEnd: endOffset > chartWidth,
    endsBeforeView: endOffset <= 0,
    startsAfterView: startOffset >= chartWidth,
  }
}
