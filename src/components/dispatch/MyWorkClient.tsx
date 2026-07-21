'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCircle } from 'lucide-react'
import type {
  CallWithRelations, DispatchAsset, DispatchFormField, PrioritizedCall, PriorityLevel, Vendor,
} from '@/lib/dispatch/types'
import { prioritizeCalls } from '@/lib/dispatch/priorityEngine'
import { linkMyTech } from '@/app/app/dispatch/actions'
import { CallRow } from './CallRow'
import { CallDetailPanel } from './CallDetailPanel'

export function MyWorkClient({ myTech, techs, calls, vendors, assets, priorityLevels, formFields, hiddenBuiltinFields, canEdit }: {
  myTech: Vendor | null
  techs: Vendor[]
  calls: CallWithRelations[]
  vendors: Vendor[]
  assets: DispatchAsset[]
  priorityLevels: PriorityLevel[]
  formFields: DispatchFormField[]
  hiddenBuiltinFields: string[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [openCallId, setOpenCallId] = useState<string | null>(null)

  const prioritized = useMemo(() => prioritizeCalls(calls), [calls])
  const active = prioritized.filter((c) => c.status !== 'completed' && c.status !== 'cancelled')
  const done = prioritized.filter((c) => c.status === 'completed' || c.status === 'cancelled')
  const openCall = openCallId ? prioritized.find((c) => c.id === openCallId) ?? null : null

  async function claim(techId: string) {
    setError(null)
    const res = await linkMyTech(techId)
    if ('error' in res && res.error) setError(res.error)
    else router.refresh()
  }

  if (!myTech) {
    const claimable = techs.filter((t) => t.active && !t.profile_id)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <UserCircle size={36} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">Who are you on the tech roster?</p>
        <p className="mt-1 text-sm text-slate-400">
          My Work shows only the calls assigned to you. Pick your name once and this page
          becomes your field queue, phone friendly.
        </p>
        {claimable.length > 0 ? (
          <div className="mt-5 space-y-2">
            {claimable.map((t) => (
              <button key={t.id} onClick={() => void claim(t.id)}
                className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {t.name}{t.trade_type ? <span className="ml-1.5 text-xs font-normal text-slate-400">{t.trade_type}</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-xs text-slate-400">
            No unclaimed techs on the roster yet. Ask a manager to add you under Manage, then come back.
          </p>
        )}
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">My Work</h1>
          <p className="text-xs text-slate-500">
            {active.length} active {active.length === 1 ? 'call' : 'calls'} assigned to {myTech.name}
          </p>
        </div>

        {error && <p className="mb-3 text-xs text-rose-600">{error}</p>}

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Active ({active.length})
          </h2>
          {active.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 py-14 text-center text-sm text-slate-400 dark:border-slate-700">
              Nothing assigned to you right now.
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((call) => (
                <CallRow key={call.id} call={call} onOpen={() => setOpenCallId(call.id)} />
              ))}
            </div>
          )}
        </section>

        {done.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recently Completed ({done.length})
            </h2>
            <div className="space-y-2">
              {done.map((call) => (
                <CallRow key={call.id} call={call} onOpen={() => setOpenCallId(call.id)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {openCall && (
        <CallDetailPanel
          call={openCall as PrioritizedCall}
          vendors={vendors} assets={assets} priorityLevels={priorityLevels} formFields={formFields}
          hiddenBuiltinFields={hiddenBuiltinFields}
          canEdit={canEdit}
          onClose={() => setOpenCallId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  )
}
