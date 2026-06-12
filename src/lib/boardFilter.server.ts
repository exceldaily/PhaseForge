import 'server-only'

import { cookies } from 'next/headers'
import { BOARD_FILTER_COOKIE } from '@/lib/boardFilter'

export async function getStoredBoardFilter() {
  const cookieStore = await cookies()
  return cookieStore.get(BOARD_FILTER_COOKIE)?.value ?? null
}
