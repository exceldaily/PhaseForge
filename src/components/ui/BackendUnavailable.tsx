'use client'

import { CloudOff } from 'lucide-react'

// Shown by the route error pages when a Supabase request timed out or the
// backend refused the connection (BackendUnreachableError). The data is intact;
// the app just could not reach it, so the only useful action is to retry.
export function BackendUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-amber-100 p-4 dark:bg-amber-900/30">
        <CloudOff size={32} className="text-amber-600 dark:text-amber-400" />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Can&apos;t reach the database right now</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          PhaseForge is up, but its database did not answer in time. Your data is safe.
          Give it a few seconds and try again. If this keeps happening, the database service needs a restart.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          Reload page
        </button>
      </div>
    </div>
  )
}
