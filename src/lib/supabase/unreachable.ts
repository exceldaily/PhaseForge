// Turns a Supabase client error that means "the backend did not answer" into a
// thrown error the route error pages recognise. supabase-js never throws on a
// failed request; it hands back `{ data: null, error }`, so a page that only
// reads `data` would quietly render empty. Pages call throwIfUnreachable on the
// errors of their first queries instead.
//
// Next.js redacts server error messages in production but keeps `digest`, and
// honours a digest the thrown error already carries, so the error pages branch
// on BACKEND_UNREACHABLE_DIGEST rather than on the message.

export const BACKEND_UNREACHABLE_DIGEST = 'PF_BACKEND_UNREACHABLE'

const UNREACHABLE_PATTERNS = [
  /timed out/i,
  /fetch failed/i,
  /failed to fetch/i,
  /load failed/i,
  /networkerror/i,
  /aborted/i,
  /ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/,
  /socket hang up/i,
  /^5(02|03|04)$/,
]

type ClientError = { message?: string | null; code?: string | null; status?: number | null } | null | undefined

export class BackendUnreachableError extends Error {
  digest = BACKEND_UNREACHABLE_DIGEST
  constructor(detail?: string | null) {
    super(detail ? `Backend unreachable: ${detail}` : 'Backend unreachable')
    this.name = 'BackendUnreachableError'
  }
}

export function isUnreachableError(error: ClientError): boolean {
  if (!error) return false
  const status = error.status ?? null
  if (status === 502 || status === 503 || status === 504) return true
  const haystack = `${error.code ?? ''} ${error.message ?? ''}`
  return UNREACHABLE_PATTERNS.some((pattern) => pattern.test(haystack))
}

export function isUnreachableDigest(error: { digest?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.digest === BACKEND_UNREACHABLE_DIGEST) return true
  // Dev mode keeps the real message; prod only keeps the digest.
  return typeof error.message === 'string' && error.message.startsWith('Backend unreachable')
}

/** Throw when `error` means the backend did not answer; a no-op otherwise. */
export function throwIfUnreachable(error: ClientError): void {
  if (isUnreachableError(error)) throw new BackendUnreachableError(error?.message)
}
