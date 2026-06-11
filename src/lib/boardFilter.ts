export const BOARD_FILTER_NONE = 'none'

export type BoardOption = {
  id: string
  name: string
  color: string
}

/**
 * Validates the `?board=` search param against the company's boards.
 * Returns the board id, BOARD_FILTER_NONE for unassigned projects,
 * or null (no filter / unknown id).
 */
export function resolveBoardFilter(
  param: string | undefined,
  boards: { id: string }[]
): string | null {
  if (!param) return null
  if (param === BOARD_FILTER_NONE) return BOARD_FILTER_NONE
  return boards.some((board) => board.id === param) ? param : null
}
