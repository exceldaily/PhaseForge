'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  CallWithRelations, DispatchAsset, DispatchFormField, PrioritizedCall, PriorityLevel, Vendor,
} from '@/lib/dispatch/types'
import { groupByPipelineStage, NEEDS_ATTENTION, PIPELINE_LABELS, PIPELINE_STAGES, type PipelineStage } from '@/lib/dispatch/pipeline'
import { prioritizeCalls } from '@/lib/dispatch/priorityEngine'
import { CallRow } from './CallRow'
import { CallDetailPanel } from './CallDetailPanel'

export function PartsClient({ calls, vendors, assets, priorityLevels, formFields, hiddenBuiltinFields, etaRedHours = 12, etaYellowHours = 24, canEdit }: {
  calls: CallWithRelations[]
  vendors: Vendor[]
  assets: DispatchAsset[]
  priorityLevels: PriorityLevel[]
  formFields: DispatchFormField[]
  hiddenBuiltinFields: string[]
  etaRedHours?: number
  etaYellowHours?: number
  canEdit: boolean
}) {
  const router = useRouter()
  const [activeStage, setActiveStage] = useState<PipelineStage>('proposal_approved')
  const [openCallId, setOpenCallId] = useState<string | null>(null)

  const groups = useMemo(() => groupByPipelineStage(calls), [calls])
  const activeCalls = useMemo(() => prioritizeCalls(groups[activeStage]), [groups, activeStage])
  const prioritized = useMemo(() => prioritizeCalls(calls), [calls])
  const openCall = openCallId ? prioritized.find((c) => c.id === openCallId) ?? null : null

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">Parts &amp; Proposal Pipeline</h1>
          <p className="text-xs text-slate-500">Milestone view of every call moving through quoting, approval, and parts fulfillment</p>
        </div>

        <div className="mb-5 flex flex-wrap items-stretch gap-2">
          {PIPELINE_STAGES.map((stage, i) => {
            const count = groups[stage].length
            const attention = NEEDS_ATTENTION.includes(stage) && count > 0
            const active = activeStage === stage
            return (
              <div key={stage} className="flex items-center gap-2">
                <button onClick={() => setActiveStage(stage)}
                  className={`flex min-w-[110px] flex-col items-center rounded-lg border px-3 py-2.5 transition ${
                    attention
                      ? 'border-teal-400 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  } ${active ? 'ring-2 ring-indigo-400/60' : ''} hover:border-slate-300 dark:hover:border-slate-600`}>
                  <span className={`text-xl font-bold ${attention ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-100'}`}>{count}</span>
                  <span className="mt-0.5 text-center text-[11px] leading-tight text-slate-500">{PIPELINE_LABELS[stage]}</span>
                  {attention && <span className="mt-1 text-[10px] font-semibold text-teal-700 dark:text-teal-400">Needs follow-up</span>}
                </button>
                {i < PIPELINE_STAGES.length - 1 && <span className="text-slate-300 dark:text-slate-600">→</span>}
              </div>
            )
          })}
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {PIPELINE_LABELS[activeStage]} ({activeCalls.length})
          </h2>
          <div className="space-y-2">
            {activeCalls.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No calls in this stage.</p>}
            {activeCalls.map((call) => (
              <CallRow key={call.id} call={call} onOpen={() => setOpenCallId(call.id)}
                  etaAlert={{ redHours: etaRedHours, yellowHours: etaYellowHours }} />
            ))}
          </div>
        </section>
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
