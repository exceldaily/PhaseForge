'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MetricEntryView, ScSettings } from '@/lib/servicechannel/server'
import { MEASURES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/servicechannel/types'
import { daysBetween } from '@/lib/servicechannel/rules'
import { cx, fmtDate } from '@/components/servicechannel/ui'
import { Msg, box, btn, btnPrimary, input } from '@/components/servicechannel/fields'
import { addMetricAction, deleteMetricAction, loadBaselineAction, saveScSettingsAction } from '../actions'
import { markScoreReviewAction } from '../recordActions'

interface ProjectLite { id: string; name: string; scoreCategory: string | null; status: string; scopeCustomer: string | null }
interface Props { metrics: MetricEntryView[]; settings: ScSettings; projects: ProjectLite[]; today: string; baselineLoaded: boolean }
const SCORE_KEYS = ['overall', 'speed', 'quality', 'engagement', 'price', 'maintenance']

export function ScoresClient({ metrics, settings, projects, today, baselineLoaded }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [m, setM] = useState({ measure: 'overall', value: '', previousValue: '', snapshotDate: today, periodLabel: `As displayed ${fmtDate(today)}`, scorecardView: 'Marketplace Score dashboard', filters: 'Company-wide', eligibleCount: '', source: 'Read from the ServiceChannel Marketplace Score dashboard', isSample: false, note: '' })
  const [t, setT] = useState({ targetOverall: String(settings.targetOverall), targetDate: settings.targetDate })
  const [filterGroup, setFilterGroup] = useState('')
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? ok : (r.error ?? 'Something went wrong.') }); if (r.ok) router.refresh() })
  const label = (k: string) => MEASURES.find((x) => x.key === k)?.label ?? k
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const real = useMemo(() => metrics.filter((x) => !x.isSample), [metrics])
  const groups = useMemo(() => [...new Set(real.map((x) => x.filters ?? 'No filters'))].sort((a, b) => (/company|all/i.test(a) ? -1 : /company|all/i.test(b) ? 1 : a.localeCompare(b))), [real])
  const series = (key: string, group: string) => real.filter((x) => x.measure === key && (x.filters ?? 'No filters') === group && x.value !== null)
  const overall = series('overall', groups.find((g) => /company|all/i.test(g)) ?? groups[0] ?? '')
  const latestOverall = overall[0] ?? null
  const daysLeft = daysBetween(today, settings.targetDate)
  const monthsLeft = Math.max(1, Math.round(daysLeft / 30.4))
  const needPerMonth = latestOverall ? Math.max(0, (settings.targetOverall + 1 - latestOverall.value!) / monthsLeft) : null

  return (
    <div className="mx-auto max-w-none space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Score Performance</h1>
          <p className="mt-0.5 text-sm text-slate-500">Official ServiceChannel scores exactly as read from the Marketplace Score dashboard, with their date and filters. Trends only compare readings with the same filters. Nothing here is estimated from work orders.</p>
        </div>
        <button className={btn} disabled={pending} onClick={() => act(() => markScoreReviewAction(), 'Score review recorded.')}>Mark scores reviewed today</button>
      </div>
      <Msg m={msg} />

      <section className="grid gap-3 lg:grid-cols-3">
        <div className={cx(box, 'border-indigo-200 bg-indigo-50/30')}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Goal</p>
          <p className="mt-1 text-sm text-slate-700">Overall above <strong>{settings.targetOverall}</strong> by <strong>{fmtDate(settings.targetDate)}</strong>.</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[10px] uppercase text-slate-500">Now</p><p className="text-2xl font-bold tabular-nums">{latestOverall?.value ?? '-'}</p></div>
            <div><p className="text-[10px] uppercase text-slate-500">Days left</p><p className="text-2xl font-bold tabular-nums">{daysLeft > 0 ? daysLeft : 0}</p></div>
            <div><p className="text-[10px] uppercase text-slate-500">Needed / month</p><p className="text-2xl font-bold tabular-nums">{needPerMonth !== null ? needPerMonth.toFixed(1) : '-'}</p></div>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Needed per month is arithmetic on the gap, not a forecast. {settings.lastScoreReviewAt ? `Last reviewed ${fmtDate(settings.lastScoreReviewAt.slice(0, 10))}.` : 'No review recorded yet.'}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-indigo-100 pt-2">
            <label className="text-[11px] font-semibold text-slate-600">Target<input type="number" className={cx(input, 'mt-1 w-20')} value={t.targetOverall} onChange={(e) => setT({ ...t, targetOverall: e.target.value })} /></label>
            <label className="text-[11px] font-semibold text-slate-600">By<input type="date" className={cx(input, 'mt-1')} value={t.targetDate} onChange={(e) => setT({ ...t, targetDate: e.target.value })} /></label>
            <button className={btn} disabled={pending} onClick={() => act(() => saveScSettingsAction({ targetOverall: Number(t.targetOverall), targetDate: t.targetDate }), 'Goal saved.')}>Save</button>
          </div>
        </div>
        <div className={cx(box, 'lg:col-span-2')}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-slate-900">Latest by measure</h2><select className={cx(input, 'w-auto')} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>{groups.map((g) => <option key={g} value={g === groups[0] ? '' : g}>{g}</option>)}</select></div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {SCORE_KEYS.map((k) => {
              const s = series(k, filterGroup || groups[0] || '')
              const e = s[0] ?? null, prev = s[1] ?? null
              const delta = e && prev ? e.value! - prev.value! : e?.previousValue != null ? e.value! - e.previousValue : null
              return (
                <div key={k} id={k} className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label(k)}</p>
                  <p className={cx('text-2xl font-bold tabular-nums', !e ? 'text-slate-300' : k === 'overall' ? (e.value! > settings.targetOverall ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-900')}>{e?.value ?? '-'}</p>
                  <p className="text-[10px] text-slate-500">{e ? <>{delta !== null && <span className={delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{delta >= 0 ? '+' : ''}{Math.round(delta * 100) / 100} </span>}{fmtDate(e.snapshotDate)}</> : 'not recorded'}</p>
                  {s.length >= 2 && <Spark values={[...s].reverse().map((x) => x.value!)} />}
                </div>
              )
            })}
          </div>
          {projects.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2 text-xs">
              <p className="font-semibold text-slate-600">Projects working on each score</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">{projects.map((p) => <li key={p.id}><Link href={`/app/servicechannel/projects/${p.id}`} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 hover:border-indigo-300"><span className="text-slate-500">{label(p.scoreCategory ?? '')}: </span>{p.name}<span className="text-slate-400"> · {PROJECT_STATUS_LABELS[p.status as ProjectStatus] ?? p.status}</span></Link></li>)}</ul>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Record an official reading</h2>
          <p className="mt-0.5 text-xs text-slate-500">Open the Marketplace Score dashboard in ServiceChannel, read the number, type it here with the date. Use the same view and filters every month.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">Measure<select className={cx(input, 'mt-1')} value={m.measure} onChange={(e) => setM({ ...m, measure: e.target.value })}>{MEASURES.map((x) => <option key={x.key} value={x.key}>{x.label} ({x.unit})</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">Date read<input type="date" className={cx(input, 'mt-1')} value={m.snapshotDate} onChange={(e) => setM({ ...m, snapshotDate: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Value<input type="number" step="0.01" className={cx(input, 'mt-1')} value={m.value} onChange={(e) => setM({ ...m, value: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Previous value (if shown)<input type="number" step="0.01" className={cx(input, 'mt-1')} value={m.previousValue} onChange={(e) => setM({ ...m, previousValue: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Dashboard / view<input className={cx(input, 'mt-1')} value={m.scorecardView} onChange={(e) => setM({ ...m, scorecardView: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Filters (customer, trade)<input className={cx(input, 'mt-1')} list="sc-filter-groups" value={m.filters} onChange={(e) => setM({ ...m, filters: e.target.value })} /><datalist id="sc-filter-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></label>
            <label className="text-xs font-semibold text-slate-600">Period<input className={cx(input, 'mt-1')} value={m.periodLabel} onChange={(e) => setM({ ...m, periodLabel: e.target.value })} placeholder="As displayed, or the months it covers" /></label>
            <label className="text-xs font-semibold text-slate-600">Eligible work orders (if shown)<input type="number" className={cx(input, 'mt-1')} value={m.eligibleCount} onChange={(e) => setM({ ...m, eligibleCount: e.target.value })} /></label>
            <label className="col-span-2 text-xs font-semibold text-slate-600">Note<input className={cx(input, 'mt-1')} value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} /></label>
            <label className="col-span-2 flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={m.isSample} onChange={(e) => setM({ ...m, isSample: e.target.checked })} /> Sample value for demonstration (labelled SAMPLE, excluded from the goal)</label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className={btnPrimary} disabled={pending} onClick={() => act(() => addMetricAction({ ...m, value: num(m.value), previousValue: num(m.previousValue), eligibleCount: num(m.eligibleCount) }).then((r) => { if (r.ok) setM({ ...m, value: '', previousValue: '', note: '' }); return r }), 'Reading recorded.')}>Record</button>
            <button className={btn} disabled={pending || baselineLoaded} onClick={() => act(() => loadBaselineAction(), 'October 10 baseline loaded.')}>{baselineLoaded ? 'October 10 baseline loaded' : 'Load the October 10 review baseline'}</button>
          </div>
        </section>
        <section className={box}>
          <h2 className="text-sm font-bold text-slate-900">Trends by filter group</h2>
          <p className="mt-0.5 text-xs text-slate-500">One line per measure and filter group, oldest to newest. Groups with a single reading show the value only.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {groups.flatMap((g) => MEASURES.map((x) => x.key).filter((k) => series(k, g).length).map((k) => { const s = [...series(k, g)].reverse(); return (
              <div key={`${g}-${k}`} className="rounded-lg bg-slate-50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label(k)} <span className="normal-case text-slate-400">· {g}</span></p>
                {s.length >= 2 ? <Spark values={s.map((x) => x.value!)} /> : null}
                <p className="text-[11px] text-slate-600">{s.map((x) => `${fmtDate(x.snapshotDate)} ${x.value}`).join(' → ')}</p>
              </div>
            ) }))}
            {!real.length && <p className="text-xs text-slate-400">No readings yet.</p>}
          </div>
        </section>
      </div>

      <section className={box}>
        <h2 className="text-sm font-bold text-slate-900">Recorded readings <span className="font-normal text-slate-400">({metrics.length})</span></h2>
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
                  <td className="max-w-[260px] truncate px-2 py-1.5 text-xs text-slate-500" title={`${e.source ?? ''}${e.note ? ` · ${e.note}` : ''}`}>{e.source ?? '-'}</td>
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

function Spark({ values }: { values: number[] }) {
  const w = 160, h = 28
  const min = Math.min(...values), max = Math.max(...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ')
  return <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-7 w-full text-indigo-500" aria-label="Trend"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} /></svg>
}
