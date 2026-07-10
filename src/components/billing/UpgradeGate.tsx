import Link from 'next/link'
import { Lock, type LucideIcon } from 'lucide-react'

// Shared "this feature needs a paid plan" screen. Used by every plan-gated
// page (Reports, Schedules, Calendar sync) so the copy, styling, and billing
// link stay in one place.
export function UpgradeGate({ icon: Icon, title, children }: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-24 text-center">
      <span className="mb-5 inline-flex rounded-2xl bg-indigo-50 p-4 text-indigo-600">
        <Icon size={28} />
      </span>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">{children}</p>
      <Link
        href="/app/billing"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        <Lock size={15} /> View upgrade options
      </Link>
    </div>
  )
}
