'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ScSettings, TemplateView } from '@/lib/servicechannel/server'
import { QUEUES, QUEUE_LABELS, INTERNAL_STATUSES, INTERNAL_STATUS_LABELS, WAITING_LABELS, WAITING_ON } from '@/lib/servicechannel/types'
import { addSuggestedDepartmentsAction, deleteTemplateAction, saveTemplateAction } from '../opsActions'
import { saveThresholdsAction } from '../recordActions'
import { cx } from '@/components/servicechannel/ui'
import { Msg, box, btn, btnPrimary, input } from '@/components/servicechannel/fields'

interface Props { settings: ScSettings; templates: TemplateView[]; departments: string[]; metricsCount: number }

export function SettingsClient({ settings, templates, departments, metricsCount }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [th, setTh] = useState({ unackDays: String(settings.thresholds.unackDays), staleDays: String(settings.thresholds.staleDays), reviewDays: String(settings.thresholds.reviewDays) })
  const blankTpl = { id: null as string | null, title: '', queue: 'general', nextAction: '', daysDue: 2, waitingOn: '', internalStatus: '', isActive: true }
  const [tpl, setTpl] = useState(blankTpl)
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div><h1 className="text-xl font-bold text-slate-900">ServiceChannel settings</h1><p className="mt-0.5 text-sm text-slate-500">Alert rules, follow-up templates, departments, and the reference data. Official scores and the goal live under <Link className="font-semibold text-indigo-700" href="/app/servicechannel/scores">Score Performance</Link> ({metricsCount} readings recorded).</p></div>
      <Msg m={msg} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Alert thresholds</h2>
          <p className="mt-0.5 text-xs text-slate-500">Internal follow-up rules in whole days. These are not ServiceChannel SLA terms; the export carries none, and nothing here invents one. Alerts are one row per condition, so changing these changes counts, not the number of notifications.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-xs font-semibold text-slate-600">Unacknowledged after<input type="number" min={1} max={60} className={cx(input, 'mt-1')} value={th.unackDays} onChange={(e) => setTh({ ...th, unackDays: e.target.value })} /><span className="font-normal text-slate-400">days assigned with no acceptance</span></label>
            <label className="text-xs font-semibold text-slate-600">Stale after<input type="number" min={1} max={60} className={cx(input, 'mt-1')} value={th.staleDays} onChange={(e) => setTh({ ...th, staleDays: e.target.value })} /><span className="font-normal text-slate-400">days blocked or silent with no update</span></label>
            <label className="text-xs font-semibold text-slate-600">Review cadence<input type="number" min={1} max={60} className={cx(input, 'mt-1')} value={th.reviewDays} onChange={(e) => setTh({ ...th, reviewDays: e.target.value })} /><span className="font-normal text-slate-400">days before a project or investigation with no update is flagged</span></label>
          </div>
          <button className={cx(btnPrimary, 'mt-3')} disabled={pending} onClick={() => act(() => saveThresholdsAction({ unackDays: Number(th.unackDays), staleDays: Number(th.staleDays), reviewDays: Number(th.reviewDays) }), 'Thresholds saved.')}>Save thresholds</button>
        </section>

        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Departments and people</h2>
          <p className="mt-0.5 text-xs text-slate-500">Departments are your company divisions (Organization settings). {departments.length ? `Configured: ${departments.join(', ')}.` : 'None configured yet.'} People, their departments and roles, and the PhaseForge user they are, live under <Link className="font-semibold text-indigo-700" href="/app/servicechannel/departments">Department Accountability</Link>.</p>
          <button className={cx(btn, 'mt-2')} disabled={pending} onClick={() => act(() => addSuggestedDepartmentsAction().then((r) => (r.ok ? { ok: true } : r)), 'Suggested departments added where missing.')}>Add suggested departments (Refrigeration, HVAC, Estimating, Scheduling, Billing, Management)</button>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-sm font-bold text-slate-900">Reference data</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
              <li><Link className="font-semibold text-indigo-700" href="/app/servicechannel/customers">Customers and stores</Link>: map store numbers to customers; the export carries no customer name.</li>
              <li><Link className="font-semibold text-indigo-700" href="/app/servicechannel/work-orders">Work Order Reference</Link>: every imported work order, with its case.</li>
              <li><Link className="font-semibold text-indigo-700" href="/app/servicechannel/import">Import Center</Link>: column mappings and coverage declarations.</li>
            </ul>
          </div>
        </section>
      </div>

      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Follow-up templates</h2>
        <p className="mt-0.5 text-xs text-slate-500">Used by the quick editor and the task forms. Edit freely; the defaults were seeded once.</p>
        <ul className="mt-2 divide-y divide-slate-100">
          {templates.map((x) => (
            <li key={x.id} className={cx('flex flex-wrap items-center gap-2 py-1.5 text-sm', !x.isActive && 'opacity-50')}>
              <span className="w-64 truncate font-medium text-slate-900">{x.title}</span>
              <span className="text-xs text-slate-500">{QUEUE_LABELS[x.queue as keyof typeof QUEUE_LABELS] ?? x.queue} · due in {x.daysDue}d{x.waitingOn ? ` · ${WAITING_LABELS[x.waitingOn as keyof typeof WAITING_LABELS] ?? x.waitingOn}` : ''}{x.internalStatus ? ` · ${INTERNAL_STATUS_LABELS[x.internalStatus as keyof typeof INTERNAL_STATUS_LABELS]}` : ''}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600" title={x.nextAction}>{x.nextAction}</span>
              <button className="text-xs text-indigo-700" onClick={() => setTpl({ id: x.id, title: x.title, queue: x.queue, nextAction: x.nextAction, daysDue: x.daysDue, waitingOn: x.waitingOn ?? '', internalStatus: x.internalStatus ?? '', isActive: x.isActive })}>Edit</button>
              <button className="text-xs text-rose-600" disabled={pending} onClick={() => { if (window.confirm('Delete this template?')) act(() => deleteTemplateAction(x.id), 'Template deleted.') }}>Delete</button>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          <input className={input} placeholder="Title" value={tpl.title} onChange={(e) => setTpl({ ...tpl, title: e.target.value })} />
          <select className={input} value={tpl.queue} onChange={(e) => setTpl({ ...tpl, queue: e.target.value })}>{QUEUES.map((q) => <option key={q} value={q}>{QUEUE_LABELS[q]}</option>)}</select>
          <input className={cx(input, 'sm:col-span-2')} placeholder="Next action text" value={tpl.nextAction} onChange={(e) => setTpl({ ...tpl, nextAction: e.target.value })} />
          <label className="text-xs text-slate-600">Due in days<input type="number" min={0} max={60} className={cx(input, 'mt-1 w-24')} value={tpl.daysDue} onChange={(e) => setTpl({ ...tpl, daysDue: Number(e.target.value) })} /></label>
          <select className={input} value={tpl.waitingOn} onChange={(e) => setTpl({ ...tpl, waitingOn: e.target.value })}><option value="">Not waiting on anyone</option>{WAITING_ON.map((w) => <option key={w} value={w}>{WAITING_LABELS[w]}</option>)}</select>
          <select className={input} value={tpl.internalStatus} onChange={(e) => setTpl({ ...tpl, internalStatus: e.target.value })}><option value="">Leave internal status</option>{INTERNAL_STATUSES.filter((x) => x !== 'verified_resolved').map((x) => <option key={x} value={x}>{INTERNAL_STATUS_LABELS[x]}</option>)}</select>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={tpl.isActive} onChange={(e) => setTpl({ ...tpl, isActive: e.target.checked })} /> Active</label>
          <div className="flex gap-2 sm:col-span-2">
            <button className={btnPrimary} disabled={pending || !tpl.title.trim() || !tpl.nextAction.trim()} onClick={() => act(() => saveTemplateAction({ ...tpl, waitingOn: tpl.waitingOn || null, internalStatus: tpl.internalStatus || null }).then((r) => { if (r.ok) setTpl(blankTpl); return r }), tpl.id ? 'Template updated.' : 'Template added.')}>{tpl.id ? 'Save changes' : 'Add template'}</button>
            {tpl.id && <button className={btn} onClick={() => setTpl(blankTpl)}>Cancel</button>}
          </div>
        </div>
      </section>
    </div>
  )
}
