'use client'

// Jobs: one row per job, two weeks across. The job is named once on the left,
// so each bar only has to say what is being done. Rows are gathered under
// their super. This is the view for running the work: who is where, what is
// next on each job, and where a job has a gap.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DAY_SHORT, addDaysIso, dayOf, dowIso, fmtDay } from '@/lib/calendar/dates'
import { layoutWeek, textOn, tint, type CalItem, type CalSuper } from '@/lib/calendar/model'
import type { CalProject } from './actions'
import { Bar, JobChip, canDrag, type ViewProps } from './parts'
import { describe } from './MonthView'

export const JOBS_DAYS = 14
const LANE = 22

interface Row { key: string; project: CalProject | null; items: CalItem[]; superId: string | null }

export function JobsView({ from, projects, supers, superColors, items, today, canEdit, colorFor, dotFor, superName, restDays, onOpen, onNew, onShowDay, drag }: ViewProps & {
  from: string
  projects: CalProject[]
  supers: CalSuper[]
  superColors: Map<string, string>
}) {
  const days = useMemo(() => Array.from({ length: JOBS_DAYS }, (_, i) => addDaysIso(from, i)), [from])
  const [over, setOver] = useState<string | null>(null)
  const to = days[days.length - 1]

  // A row for every job with something in these two weeks, gathered by super.
  const groups = useMemo(() => {
    const byJob = new Map<string, CalItem[]>()
    for (const it of items) {
      if (it.start > to || it.end < from) continue
      const k = it.projectId ?? ''
      byJob.set(k, [...(byJob.get(k) ?? []), it])
    }
    const rows: Row[] = [...byJob.entries()].map(([k, list]) => {
      const project = projects.find((p) => p.id === k) ?? null
      return { key: k || 'none', project, items: list, superId: project?.superId ?? null }
    })
    const order = new Map(supers.map((s, i) => [s.id, i]))
    const bucket = new Map<string, Row[]>()
    for (const r of rows) {
      const g = !r.project ? 'company' : r.superId && order.has(r.superId) ? r.superId : 'none'
      bucket.set(g, [...(bucket.get(g) ?? []), r])
    }
    const rank = (g: string) => (g === 'company' ? -1 : g === 'none' ? 999 : order.get(g) ?? 998)
    return [...bucket.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([g, list]) => ({
      id: g,
      rows: list.sort((a, b) => (a.project?.label ?? '').localeCompare(b.project?.label ?? '')),
    }))
  }, [items, projects, supers, from, to])

  const cols = { gridTemplateColumns: `minmax(180px, 260px) repeat(${JOBS_DAYS}, minmax(52px, 1fr))` }
  const empty = groups.length === 0

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-[920px]">
        {/* Day header */}
        <div className="sticky top-0 z-20 grid border-b border-slate-300 bg-white" style={cols}>
          <div className="sticky left-0 z-10 flex items-end border-r border-slate-300 bg-white px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Job</div>
          {days.map((date) => {
            const dow = dowIso(date)
            return (
              <button key={date} type="button" onClick={() => onShowDay(date)} title={`Open ${fmtDay(date)}`}
                className={cn('flex flex-col items-center py-1 hover:bg-slate-100', dow === 0 ? 'border-l-2 border-slate-300' : 'border-l border-slate-200',
                  restDays.includes(dow) && 'bg-slate-100')}>
                <span className={cn('text-[10px] font-semibold uppercase tracking-wide', date === today ? 'text-indigo-600' : restDays.includes(dow) ? 'text-slate-400' : 'text-slate-500')}>{DAY_SHORT[dow]}</span>
                <span className={cn('flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold',
                  date === today ? 'bg-indigo-600 text-white' : restDays.includes(dow) ? 'text-slate-400' : 'text-slate-800')}>{dayOf(date)}</span>
              </button>
            )
          })}
        </div>

        {empty && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Users size={28} className="text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-600">No jobs have anything in these two weeks</p>
            <p className="mt-1 max-w-sm text-xs text-slate-400">Step forward with the arrows, or check the filters on the left.</p>
          </div>
        )}

        {groups.map((group) => {
          const sup = supers.find((s) => s.id === group.id) ?? null
          const supColor = sup ? superColors.get(sup.id) ?? '#64748b' : '#64748b'
          const title = group.id === 'company' ? 'Company, not tied to a job' : sup ? sup.name : 'No super set'
          return (
            <div key={group.id}>
              {/* Super band */}
              <div className="sticky left-0 flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: supColor, color: textOn(supColor) }}>{title}</span>
                <span className="text-[11px] text-slate-400">{group.rows.length} {group.id === 'company' ? 'row' : group.rows.length === 1 ? 'job' : 'jobs'}</span>
              </div>
              {group.rows.map((row) => {
                const { segments, lanes } = layoutWeek(row.items, from, JOBS_DAYS)
                const color = row.project?.color ?? '#64748b'
                const height = Math.max(1, lanes) * LANE + 10
                return (
                  <div key={row.key} className="grid border-b border-slate-200" style={{ ...cols, minHeight: height }}>
                    {/* Job name, once */}
                    <div className="sticky left-0 z-10 flex items-start gap-2 border-r border-slate-300 bg-white px-2 py-1.5" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
                      {row.project ? (
                        <>
                          <JobChip code={row.project.code} color={color} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold leading-tight text-slate-900" title={row.project.name}>{row.project.label}</span>
                            {row.project.jobNumber && <span className="block text-[10px] text-slate-400">Job# {row.project.jobNumber}</span>}
                          </span>
                          <Link href={`/app/projects/${row.project.id}`} title="Open project" aria-label={`Open ${row.project.name}`}
                            className="mt-0.5 shrink-0 text-slate-300 hover:text-indigo-600"><ExternalLink size={12} /></Link>
                        </>
                      ) : <span className="text-[13px] font-semibold text-slate-600">Events</span>}
                    </div>
                    {/* The two weeks */}
                    <div className="relative" style={{ gridColumn: `2 / span ${JOBS_DAYS}` }}>
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${JOBS_DAYS}, minmax(0, 1fr))` }}>
                        {days.map((date) => {
                          const dow = dowIso(date)
                          const id = `${row.key}:${date}`
                          return (
                            <div key={date}
                              onClick={() => canEdit && onNew(date, null, row.project?.id ?? null)}
                              onDragOver={(e) => { if (drag.active) { e.preventDefault(); if (over !== id) setOver(id) } }}
                              onDragLeave={() => setOver((cur) => (cur === id ? null : cur))}
                              onDrop={(e) => { e.preventDefault(); setOver(null); drag.drop(date) }}
                              style={date === today ? { backgroundColor: tint('#4f46e5', 0.06) } : undefined}
                              className={cn(dow === 0 ? 'border-l-2 border-slate-300' : 'border-l border-slate-200',
                                restDays.includes(dow) && 'bg-slate-100', canEdit && 'cursor-pointer hover:bg-indigo-50/50',
                                over === id && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400')} />
                          )
                        })}
                      </div>
                      <div className="pointer-events-none relative grid content-start gap-y-0.5 py-1"
                        style={{ gridTemplateColumns: `repeat(${JOBS_DAYS}, minmax(0, 1fr))`, gridAutoRows: LANE - 2 }}>
                        {segments.map((seg) => (
                          <div key={seg.key} className="min-w-0 px-0.5" style={{ gridColumn: `${seg.col + 1} / span ${seg.span}`, gridRow: seg.lane + 1 }}>
                            <Bar item={seg.item} color={colorFor(seg.item)} dot={dotFor(seg.item)} hideJob={!!row.project}
                              title={describe(seg.item, superName(seg.item.superId))}
                              cutLeft={seg.startsBefore} cutRight={seg.endsAfter} muted={drag.active}
                              onOpen={() => onOpen(seg.item)} draggable={canDrag(seg.item, canEdit)}
                              onDragStart={(e) => {
                                const r = e.currentTarget.getBoundingClientRect()
                                const idx = Math.max(0, Math.min(seg.span - 1, Math.floor((e.clientX - r.left) / (r.width / seg.span))))
                                drag.start(e, seg.item, days[seg.col + idx])
                              }}
                              onDragEnd={drag.end} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
