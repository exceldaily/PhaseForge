import Link from 'next/link'
import { SearchX } from 'lucide-react'

// Renders inside the authenticated app layout (sidebar/topbar stay visible)
// whenever a page calls notFound() — deleted record, bad ID, wrong org, etc.
export default function AppNotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800">
        <SearchX size={32} className="text-slate-400" />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">We couldn&apos;t find that</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          This record may have been deleted, moved, or the link is out of date.
        </p>
      </div>
      <Link
        href="/app/dashboard"
        className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
