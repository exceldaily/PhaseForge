'use client'

// Org-wide trade filter (premium): a top-bar switcher that scopes Projects,
// Gantt, Dashboard, Boards and Change Orders to one trade. The choice lives in
// a cookie so every server-rendered page filters on it; "All trades" clears it.

import { useRouter } from 'next/navigation'
import { HardHat, ChevronDown } from 'lucide-react'

export function TradeSwitcher({ current, trades }: { current: string; trades: string[] }) {
  const router = useRouter()
  const set = (v: string) => {
    document.cookie = `pf-trade=${encodeURIComponent(v)}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }
  return (
    <div className="relative">
      <HardHat size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
      <select
        value={current}
        onChange={(e) => set(e.target.value)}
        title="Filter the whole app to one trade"
        className={
          'appearance-none rounded-lg border py-1.5 pl-7 pr-7 text-xs font-medium outline-none transition-colors max-w-36 sm:max-w-none truncate ' +
          (current !== 'all'
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')
        }
      >
        <option value="all">All trades</option>
        {trades.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  )
}
