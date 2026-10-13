'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { MetricEntryView, ScSettings, TemplateView } from '@/lib/servicechannel/server'
import { QUEUES, QUEUE_LABELS, INTERNAL_STATUSES, INTERNAL_STATUS_LABELS } from '@/lib/servicechannel/types'
import { WAITING_LABELS, WAITING_ON } from '@/lib/servicechannel/actionCenter'
import { addSuggestedDepartmentsAction, deleteTemplateAction, saveTemplateAction } from '../opsActions'
import { MEASURES } from '@/lib/servicechannel/types'
import { cx, fmtDate } from '@/components/servicechannel/ui'
import { addMetricAction, deleteMetricAction, loadBaselineAction, saveScSettingsAction } from '../actions'

interface Props { metrics: MetricEntryView[]; settings: ScSettings; templates: TemplateView[]; departments: string[]; baselineLoaded: boolean }

export function SettingsClient({ metrics, settings, templates, departments, baselineLoaded }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [m, setM] = useState({ measure: 'overall', value: '', previousValue: '', snapshotDate: new Date().toISOString().slice(0, 10), periodLabel: '', scorecardView: 'Provider homepage', filters: 'Company-wide, all trades', eligibleCount: '', source: 'Read from ServiceChannel', isSample: false, note: '' })
  const [t, setT] = useState({ targetOverall: String(settings.targetOverall), targetDate: settings.targetDate })
  const blankTpl = { id: null as string | null, title: '', queue: 'general', nextAction: '', daysDue: 2, waitingOn: '', internalStatus: '', isActive: true }
  const [tpl, setTpl] = useState(blankTpl)
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })
  const label = (k: string) => MEASURES.find((x) => x.key === k)?.label ?? k
  const input = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm'
  const box = 'rounded-xl border border-slate-200 bg-white p-4'
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div><h1 className="text-xl font-bold text-slate-900">ServiceChannel settings</h1><p className="mt-0.5 text-sm text-slate-500">Official scores are typed in from ServiceChannel with their provenance. PhaseForge never estimates them.</p></div>
      {msg && <div className={cx('rounded-lg border p-3 text-sm', msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>{msg.text}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Record an official reading</h2>
          <p className="mt-0.5 text-xs text-slate-500">Use the same view and filters every month so readings compare like with like.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">Measure<select className={cx(input, 'mt-1 block w-full')} value={m.measure} onChange={(e) => setM({ ...m, measure: e.target.value })}>{MEASURES.map((x) => <option key={x.key} value={x.key}>{x.label} ({x.unit})</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">Date read<input type="date" className={cx(input, 'mt-1 block w-full')} value={m.snapshotDate} onChange={(e) => setM({ ...m, snapshotDate: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Value<input type="number" step="0.01" className={cx(input, 'mt-1 block w-full')} value={m.value} onChange={(e) => setM({ ...m, value: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Previous value (optional)<input type="number" step="0.01" className={cx(input, 'mt-1 block w-full')} value={m.previousValue} onChange={(e) => setM({ ...m, previousValue: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Scorecard view<input className={cx(input, 'mt-1 block w-full')} value={m.scorecardView} onChange={(e) => setM({ ...m, scorecardView: e.target.value })} placeholder="Provider homepage" /></label>
            <label className="text-xs font-semibold text-slate-600">Filters<input className={cx(input, 'mt-1 block w-full')} value={m.filters} onChange={(e) => setM({ ...m, filters: e.target.value })} placeholder="Company-wide, all trades" /></label>
            <label className="text-xs font-semibold text-slate-600">Period<input className={cx(input, 'mt-1 block w-full')} value={m.periodLabel} onChange={(e) => setM({ ...m, periodLabel: e.target.value })} placeholder="e.g. September 2026, or 36 months through Sep 2026" /></label>
            <label className="text-xs font-semibold text-slate-600">Eligible work orders (if shown)<input type="number" className={cx(input, 'mt-1 block w-full')} value={m.eligibleCount} onChange={(e) => setM({ ...m, eligibleCount: e.target.value })} /></label>
            <label className="col-span-2 text-xs font-semibold text-slate-600">Note<input className={cx(input, 'mt-1 block w-full')} value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} /></label>
            <label className="col-span-2 flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={m.isSample} onChange={(e) => setM({ ...m, isSample: e.target.checked })} /> This is a sample value for demonstration (shown with a SAMPLE label)</label>
          </div>
          <button className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} onClick={() => act(() => addMetricAction({ ...m, value: num(m.value), previousValue: num(m.previousValue), eligibleCount: num(m.eligibleCount) }), 'Reading recorded.')}>Record</button>
        </section>

        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Goal</h2>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-600">Overall score above<input type="number" step="1" className={cx(input, 'mt-1 block w-28')} value={t.targetOverall} onChange={(e) => setT({ ...t, targetOverall: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">By<input type="date" className={cx(input, 'mt-1 block')} value={t.targetDate} onChange={(e) => setT({ ...t, targetDate: e.target.value })} /></label>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={pending} onClick={() => act(() => saveScSettingsAction({ targetOverall: Number(t.targetOverall), targetDate: t.targetDate }), 'Goal saved.')}>Save</button>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-sm font-bold text-slate-900">October 2026 baseline (CEO packet)</h3>
            <p className="mt-0.5 text-xs text-slate-500">Loads the dated values from the October 10 review: Quality 46 (was 68), recall rate 9% (was 5%), Engagement 88, quote turnaround 4.60 days, CubeSmart PM check-in 36% and scheduling 49%. The quote and maintenance figures cover 36 complete months through September and are labeled that way. The Overall score was not captured and is left blank for you to read from the provider homepage.</p>
            <button className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={pending || baselineLoaded} onClick={() => act(() => loadBaselineAction(), 'Baseline loaded.')}>{baselineLoaded ? 'Baseline loaded' : 'Load baseline'}</button>
          </div>
        </section>
      </div>

      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Follow-up templates</h2>
        <p className="mt-0.5 text-xs text-slate-500">Used by the quick editor and the task form. Edit freely; the defaults were seeded once.</p>
        <ul className="mt-2 divide-y divide-slate-100">
          {templates.map((x) => (
            <li key={x.id} className={cx('flex flex-wrap items-center gap-2 py-1.5 text-sm', !x.isActive && 'opacity-50')}>
              <span className="w-64 truncate font-medium text-slate-900">{x.title}</span>
              <span className="text-xs text-slate-500">{QUEUE_LABELS[x.queue as keyof typeof QUEUE_LABELS] ?? x.queue} · due in {x.daysDue}d{x.waitingOn ? ` · ${WAITING_LABELS[x.waitingOn as keyof typeof WAITING_LABELS]}` : ''}{x.internalStatus ? ` · ${INTERNAL_STATUS_LABELS[x.internalStatus as keyof typeof INTERNAL_STATUS_LABELS]}` : ''}</span>
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
          <label className="text-xs text-slate-600">Due in days<input type="number" min={0} max={60} className={cx(input, 'mt-1 block w-24')} value={tpl.daysDue} onChange={(e) => setTpl({ ...tpl, daysDue: Number(e.target.value) })} /></label>
          <select className={input} value={tpl.waitingOn} onChange={(e) => setTpl({ ...tpl, waitingOn: e.target.value })}><option value="">Not waiting on anyone</option>{WAITING_ON.map((w) => <option key={w} value={w}>{WAITING_LABELS[w]}</option>)}</select>
          <select className={input} value={tpl.internalStatus} onChange={(e) => setTpl({ ...tpl, internalStatus: e.target.value })}><option value="">Leave internal status</option>{INTERNAL_STATUSES.filter((x) => x !== 'verified_resolved').map((x) => <option key={x} value={x}>{INTERNAL_STATUS_LABELS[x]}</option>)}</select>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={tpl.isActive} onChange={(e) => setTpl({ ...tpl, isActive: e.target.checked })} /> Active</label>
          <div className="flex gap-2 sm:col-span-2">
            <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !tpl.title.trim() || !tpl.nextAction.trim()} onClick={() => act(() => saveTemplateAction({ ...tpl, waitingOn: tpl.waitingOn || null, internalStatus: tpl.internalStatus || null }).then((r) => { if (r.ok) setTpl(blankTpl); return r }), tpl.id ? 'Template updated.' : 'Template added.')}>{tpl.id ? 'Save changes' : 'Add template'}</button>
            {tpl.id && <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setTpl(blankTpl)}>Cancel</button>}
          </div>
        </div>
      </section>

      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Departments</h2>
        <p className="mt-0.5 text-xs text-slate-500">Departments are your company divisions, managed under Organization settings. {departments.length ? `Configured: ${departments.join(', ')}.` : 'None configured yet.'}</p>
        <button className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={pending} onClick={() => act(() => addSuggestedDepartmentsAction().then((r) => (r.ok ? { ok: true } : r)), 'Suggested departments added where missing.')}>Add suggested departments (Refrigeration, HVAC, Estimating, Scheduling, Billing, Management)</button>
      </section>

      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Recorded readings</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{['Date', 'Measure', 'Value', 'Previous', 'Period', 'View', 'Filters', 'Source', ''].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{fmtDate(e.snapshotDate)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-900">{label(e.measure)}{e.isSample && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">SAMPLE</span>}</td>
                  <td className="px-2 py-1.5 tabular-nums">{e.value ?? '-'}{e.unit && e.unit !== 'score' ? ` ${e.unit}` : ''}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-600">{e.previousValue ?? '-'}</td>
                  <td className="max-w-[240px] truncate px-2 py-1.5 text-xs text-slate-600" title={e.periodLabel ?? ''}>{e.periodLabel ?? '-'}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-600">{e.scorecardView ?? '-'}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-600">{e.filters ?? '-'}</td>
                  <td className="max-w-[260px] truncate px-2 py-1.5 text-xs text-slate-500" title={e.source ?? ''}>{e.source ?? '-'}</td>
                  <td className="px-2 py-1.5"><button className="text-xs text-rose-600" disabled={pending} onClick={() => { if (window.confirm('Delete this reading?')) act(() => deleteMetricAction(e.id), 'Deleted.') }}>Delete</button></td>
                </tr>
              ))}
              {!metrics.length && <tr><td colSpan={9} className="px-2 py-6 text-center text-slate-500">Nothing recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
