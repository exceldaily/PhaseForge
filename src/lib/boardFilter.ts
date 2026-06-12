export const BOARD_FILTER_NONE = 'none'
export const BOARD_FILTER_COOKIE = 'phaseforge_board_filter'

export type BoardOption = {
  id: string
  name: string
  color: string
}

/**
 * Validates the `?board=` search param against the company's boards.
 * Falls back to a stored board id when the current route does not include
 * `?board=` so the user's last board selection can persist between pages.
 * Returns the board id, BOARD_FILTER_NONE for unassigned projects, or null.
 */
export function resolveBoardFilter(
  param: string | undefined,
  boards: { id: string }[],
  fallbackParam?: string | null
): string | null {
  for (const candidate of [param, fallbackParam]) {
    if (!candidate) continue
    if (candidate === BOARD_FILTER_NONE) return BOARD_FILTER_NONE
    if (boards.some((board) => board.id === candidate)) return candidate
  }

  return null
}

export function appendBoardFilter(href: string, boardFilter: string | null | undefined) {
  if (!boardFilter) return href

  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}board=${encodeURIComponent(boardFilter)}`
}
