'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

// Catches runtime errors thrown by any page/layout in the authenticated
// section. Complements the component-level ErrorBoundary (used around
// specific widgets) by catching anything that bubbles up to the route level.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Logged client-side only — no sensitive data, just the message + digest
    // for correlating with server logs if a monitoring service is added later.
    console.error('App route error:', error.message, error.digest)
  }, [error])

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-rose-100 p-4 dark:bg-rose-900/30">
        <AlertTriangle size={32} className="text-rose-500" />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Something went wrong</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          The page hit an unexpected error. You can try again, or head back to the dashboard.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          Try again
        </button>
        <Link
          href="/app/dashboard"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
