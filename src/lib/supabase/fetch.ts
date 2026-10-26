// Every Supabase request (REST, Auth, Storage) from the app goes through this
// fetch so a hung backend fails in seconds instead of hanging the page.
//
// Why: on Oct 25-26 2026 PostgREST on the shared Supabase project hung for 23
// hours. Postgres was healthy, sign-in succeeded (Auth is a separate service),
// and then every /app page waited forever on its first profile query. With a
// timeout the query errors, the page throws BackendUnreachableError, and the
// user sees "can't reach the database" with a retry instead of a frozen tab.
//
// Budgets: server pages chain a few serial calls (auth, profile, company) and
// must finish inside Vercel's function limit, so they fail fast. The browser
// can afford to wait longer. The admin client runs imports and crons whose
// single statements can legitimately take a while.
export const SERVER_FETCH_TIMEOUT_MS = 8_000
export const BROWSER_FETCH_TIMEOUT_MS = 15_000
export const ADMIN_FETCH_TIMEOUT_MS = 30_000

export const FETCH_TIMEOUT_MESSAGE = 'Supabase request timed out'

export function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(new Error(`${FETCH_TIMEOUT_MESSAGE} after ${timeoutMs} ms`)),
      timeoutMs,
    )
    // Respect a caller's own signal (query.abortSignal(...)) alongside ours.
    const upstream = init?.signal ?? undefined
    const signal =
      upstream && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([upstream, controller.signal])
        : controller.signal
    return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer))
  }
}
