'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { BackendUnavailable } from '@/components/ui/BackendUnavailable'
import { isUnreachableDigest } from '@/lib/supabase/unreachable'

// Root error boundary. Errors thrown by src/app/app/layout.tsx itself (the
// authenticated shell's own profile/company loads) land here, because a
// segment's error.tsx cannot catch its own layout. Without this file Next
// would show its bare default error page.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Root route error:', error.message, error.digest)
  }, [error])

  if (isUnreachableDigest(error)) return <BackendUnavailable onRetry={reset} />

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-rose-100 p-4">
        <AlertTriangle size={32} className="text-rose-500" />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-800">Something went wrong</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          The page hit an unexpected error. You can try again, or head back to the dashboard.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Try again
        </button>
        <Link href="/app/dashboard" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
