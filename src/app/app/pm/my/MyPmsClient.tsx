'use client'

// A technician's own list, built for a phone in one hand: what is assigned,
// what is next, and one big button to pick the checklist back up.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, ClipboardCheck, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cyclePct, isOverdue } from '@/lib/pm/progress'
import { fmtDate } from '@/lib/pm/quarters'
import { POST_FIELD_STATUSES, PRE_WORK_STATUSES, type PmCycle, type PmStore, type PmTech } from '@/lib/pm/types'
import { BlockerChips, Empty, OverdueChip, PmPage, ProgressBar, StatusChip, fieldCls } from '@/components/pm/ui'

const rank = (c: PmCycle, today: string) =>
  (isOverdue(c, today) ? 0 : 10) + (c.status === 'in_progress' ? 0 : c.status === 'scheduled' ? 2 : PRE_WORK_STATUSES.includes(c.status) ? 4 : 6)

export function MyPmsClient({ stores, techs, cycles, myTechIds, canCoordinate, quartersWithChecklist, today }: {
  stores: PmStore[]; techs: PmTech[]; cycles: PmCycle[]; myTechIds: string[]; canCoordinate: boolean; quartersWithChecklist: number[]; today: string
}) {
  // A coordinator can look at any technician's list. A technician only ever sees their own.
  const [viewing, setViewing] = useState<string>(myTechIds[0] ?? (canCoordinate ? techs.find((t) => t.isActive)?.id ?? '' : ''))
  const ids = useMemo(() => (canCoordinate ? (viewing ? [viewing] : []) : myTechIds), [canCoordinate, viewing, myTechIds])
  const storeOf = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])
  const mine = useMemo(() => cycles.filter((c) => ids.includes(c.techId ?? '') || ids.includes(c.helperTechId ?? '')), [cycles, ids])

  const groups = [
    { key: 'now', title: 'In progress', list: mine.filter((c) => c.status === 'in_progress' || c.status === 'on_hold') },
    { key: 'next', title: 'Up next', list: mine.filter((c) => PRE_WORK_STATUSES.includes(c.status)) },
    { key: 'office', title: 'Field work done, with the office', list: mine.filter((c) => POST_FIELD_STATUSES.includes(c.status) && c.status !== 'completed') },
    { key: 'done', title: 'Closed in the last three weeks', list: mine.filter((c) => c.status === 'completed') },
  ].map((g) => ({ ...g, list: [...g.list].sort((a, b) => rank(a, today) - rank(b, today) || (a.scheduledDate ?? a.dueDate ?? '9999').localeCompare(b.scheduledDate ?? b.dueDate ?? '9999')) }))
  const viewingName = techs.find((t) => t.id === viewing)?.name
  const self = myTechIds.includes(viewing) || !canCoordinate

  return (
    <PmPage title={self ? 'My PMs' : `${viewingName ?? 'Technician'}: PMs`} subtitle={self ? 'The PMs assigned to you. Tap one to pick its checklist back up.' : 'What this technician sees on their phone.'}
      actions={canCoordinate && techs.length > 0 && (
        <select value={viewing} onChange={(e) => setViewing(e.target.value)} className={cn(fieldCls, 'w-auto')} aria-label="Technician">
          {techs.filter((t) => t.isActive || t.id === viewing).map((t) => <option key={t.id} value={t.id}>{t.name}{myTechIds.includes(t.id) ? ' (you)' : ''}</option>)}
        </select>
      )}>
      {ids.length === 0 ? (
        <Empty icon={<ClipboardCheck size={30} />} title={canCoordinate ? 'No technicians yet' : 'Your login is not linked to a technician'}>
          {canCoordinate
            ? <>Add technicians under <Link href="/app/pm/settings#techs" className="font-semibold text-indigo-600 underline">PM Settings</Link>, then assign them stores and PMs.</>
            : 'Ask a coordinator to link your login to your technician name under PM Settings. Until then you can look at PMs but not work them.'}
        </Empty>
      ) : mine.length === 0 ? (
        <Empty icon={<ClipboardCheck size={30} />} title="Nothing assigned right now">PMs show up here as soon as a coordinator assigns them.</Empty>
      ) : (
        <div className="mx-auto max-w-3xl space-y-5" data-help="pm-my-list">
          {groups.filter((g) => g.list.length > 0).map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title} <span className="text-slate-400">({g.list.length})</span></h2>
              <ul className="space-y-2.5">
                {g.list.map((c) => {
                  const s = storeOf.get(c.storeId)
                  const address = s ? [s.address, s.city].filter(Boolean).join(', ') : ''
                  const started = !!c.templateVersionId
                  const canOpen = started || quartersWithChecklist.includes(c.quarter)
                  const closed = c.status === 'completed'
                  return (
                    <li key={c.id} className={cn('rounded-2xl border bg-white p-4', isOverdue(c, today) ? 'border-rose-300' : 'border-slate-200')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-lg font-bold leading-tight text-slate-900">Store {s?.storeNumber ?? ''}</p>
                          <p className="text-xs font-medium text-slate-500">Q{c.quarter} {c.year}{c.jobNumber ? `, job ${c.jobNumber}` : ', no job number yet'}</p>
                        </div>
                        <StatusChip status={c.status} />
                      </div>
                      {address && (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`ALDI ${address} ${s?.state ?? ''}`)}`} target="_blank" rel="noopener noreferrer"
                          className="mt-2 flex items-start gap-1.5 text-sm text-indigo-700 hover:underline"><MapPin size={15} className="mt-0.5 shrink-0" /> {address}</a>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
                        {c.scheduledDate && <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> Scheduled {fmtDate(c.scheduledDate, today)}</span>}
                        {c.dueDate && !isOverdue(c, today) && <span>Due {fmtDate(c.dueDate, today)}</span>}
                        {c.priority && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{c.priority}</span>}
                        <OverdueChip cycle={c} today={today} />
                        <BlockerChips cycle={c} />
                      </div>
                      {started && <div className="mt-3"><ProgressBar value={cyclePct(c)} label={`Checklist ${c.checklistDone} of ${c.checklistTotal}`} /></div>}
                      {c.returnVisitNote && c.returnVisitNeeded && <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">Return visit: {c.returnVisitNote}</p>}
                      <div className="mt-3 flex gap-2">
                        {canOpen ? (
                          <Link href={`/app/pm/jobs/${c.id}/work`} className={cn('inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold',
                            closed || g.key === 'office' ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                            {closed || g.key === 'office' ? 'View checklist' : started ? 'Resume checklist' : 'Start checklist'} <ArrowRight size={16} />
                          </Link>
                        ) : (
                          <p className="flex-1 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">The Q{c.quarter} checklist has not been published yet. The office has to set it up before this PM can be worked.</p>
                        )}
                        <Link href={`/app/pm/jobs/${c.id}`} className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">Details</Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PmPage>
  )
}
