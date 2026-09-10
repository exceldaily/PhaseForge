'use client'

// How system posts look in a conversation: a compact card per kind, with a
// link back to the thing that changed.

import Link from 'next/link'
import { CalendarDays, FileDiff, Layers, ArrowRight } from 'lucide-react'
import { dayRangeLabel, departmentLabel, groupDays, type ChatEvent } from '@/lib/chat/systemEvents'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function SystemCard({ event, actor, time, projectId }: { event: ChatEvent; actor: string; time: string; projectId: string | null }) {
  const meta = <span className="text-[10px] text-slate-400">{actor} · {time}</span>

  if (event.type === 'change_order') {
    return (
      <Link href={`/app/change-orders/${event.coId}`} className="block rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 hover:border-violet-400">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-700"><FileDiff size={11} /> Change order {event.action === 'created' ? 'opened' : 'moved'}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-900">{event.label} <span className="font-normal text-slate-700">{event.title}</span></p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          {event.from && <><span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{event.from}</span><ArrowRight size={11} className="text-slate-400" /></>}
          <span className="rounded bg-violet-600 px-1.5 py-0.5 font-semibold text-white">{event.to}</span>
          {event.amount != null && <span className="font-semibold text-slate-800">{money(event.amount)}</span>}
        </p>
        <p className="mt-1">{meta}</p>
      </Link>
    )
  }

  if (event.type === 'board_move') {
    const body = (
      <>
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-700"><Layers size={11} /> Card moved{event.board ? ` on ${event.board}` : ''}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{event.projectName}</span>
          {event.from && <><span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{event.from}</span><ArrowRight size={11} className="text-slate-400" /></>}
          {event.to ? <span className="rounded bg-sky-600 px-1.5 py-0.5 font-semibold text-white">{event.to}</span> : <span className="text-slate-500">off the board</span>}
        </p>
        <p className="mt-1">{meta}</p>
      </>
    )
    return projectId
      ? <Link href={`/app/projects/${projectId}`} className="block rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 hover:border-sky-400">{body}</Link>
      : <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2">{body}</div>
  }

  // Schedule
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
        <CalendarDays size={11} /> {event.updated ? 'Updated schedule' : 'Schedule'}{event.department ? `, ${departmentLabel(event.department)}` : ''}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">
        {event.team} team <span className="font-normal text-slate-500">week of {dayRangeLabel(event.weekStart, event.weekStart).replace(/^\w+ /, '')}</span>
      </p>
      <div className="mt-1.5 space-y-2">
        {event.jobs.map((j, i) => (
          <div key={i} className="rounded-md bg-white px-2.5 py-1.5 ring-1 ring-emerald-100">
            <p className="text-xs font-semibold text-slate-800">
              {j.title}
              {j.jobNumber && (j.url
                ? <a href={j.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 font-medium text-indigo-600 hover:underline">Job# {j.jobNumber}</a>
                : <span className="ml-1.5 font-normal text-slate-400">Job# {j.jobNumber}</span>)}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {groupDays(j.days).map((g, k) => (
                <li key={k} className="flex gap-2 text-[11px]">
                  <span className="w-32 shrink-0 font-medium text-slate-500">{dayRangeLabel(g.from, g.to)}</span>
                  <span className="text-slate-800">{g.names.join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-1.5 flex items-center justify-between">
        {meta}
        <Link href={`/app/schedules?week=${event.weekStart}`} className="text-[10px] font-medium text-emerald-700 hover:underline">Open Schedules</Link>
      </p>
    </div>
  )
}
