'use client'

// One store, permanently: who to call, what is installed, every quarter's PM
// and job number, and every issue ever found there.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { cyclePct } from '@/lib/pm/progress'
import { fmtDate, quarterOf } from '@/lib/pm/quarters'
import {
  EQUIPMENT_KIND_LABEL, REPAIR_LABEL, REPAIR_OPEN, SEVERITY_LABEL, SEVERITY_TONE, SYSTEM_LABEL,
  type EquipmentKind, type PmActivity, type PmCycle, type PmDeficiency, type PmEquipment, type PmExclusion, type PmStore, type PmTech,
} from '@/lib/pm/types'
import { BlockerChips, Card, Empty, ErrorNote, PmPage, ProgressBar, StatusChip, fieldCls } from '@/components/pm/ui'
import { StoreFormModal } from '@/components/pm/StoreForm'
import { ActivityList } from '@/components/pm/ActivityList'
import { createCycle, deleteEquipment, deleteExclusion, saveEquipment, saveExclusion } from '../../actions'

export interface JobNumberRow { id: string; pmId: string; jobNumber: string; receivedDate: string | null; isCurrent: boolean; enteredBy: string | null; enteredAt: string; supersededAt: string | null }

const KINDS = Object.keys(EQUIPMENT_KIND_LABEL) as EquipmentKind[]

export function StoreProfileClient({ store, techs, cycles, jobNumbers, equipment, exclusions, deficiencies, checkCodes, activity, names, canEdit, today }: {
  store: PmStore; techs: PmTech[]; cycles: PmCycle[]; jobNumbers: JobNumberRow[]
  equipment: PmEquipment[]; exclusions: PmExclusion[]; deficiencies: PmDeficiency[]
  checkCodes: { code: string; description: string }[]
  activity: PmActivity[]; names: Record<string, string>; canEdit: boolean; today: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const techName = (id: string | null) => techs.find((t) => t.id === id)?.name ?? null
  const now = quarterOf(today)
  const address = [store.address, store.city, store.state, store.postalCode].filter(Boolean).join(', ')
  const numbersByPm = useMemo(() => {
    const m = new Map<string, JobNumberRow[]>()
    for (const j of jobNumbers) m.set(j.pmId, [...(m.get(j.pmId) ?? []), j])
    return m
  }, [jobNumbers])
  const openDefs = deficiencies.filter((d) => REPAIR_OPEN(d.repairStatus)).length

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    const res = await fn()
    if (!res.ok) setError(res.error ?? 'That did not save.')
    router.refresh()
    return res.ok
  }

  /* ── Add a quarter ── */
  const [addYear, setAddYear] = useState(now.year)
  const [addQuarter, setAddQuarter] = useState<number>(now.quarter)
  const addCycle = async () => {
    const res = await createCycle({ storeId: store.id, year: addYear, quarter: addQuarter })
    if (!res.ok) { setError(res.error); return }
    router.push(`/app/pm/jobs/${res.id}`)
  }

  /* ── Equipment ── */
  const [eq, setEq] = useState<{ id?: string; kind: EquipmentKind; label: string; manufacturer: string; model: string; serialNumber: string; refrigerant: string; notes: string } | null>(null)
  const saveEq = async () => {
    if (!eq) return
    const sort = eq.id ? equipment.find((e) => e.id === eq.id)?.sortOrder ?? 0 : (Math.max(0, ...equipment.filter((e) => e.kind === eq.kind).map((e) => e.sortOrder)) + 10)
    if (await run(() => saveEquipment({ ...eq, storeId: store.id, sortOrder: sort }))) setEq(null)
  }
  const byKind = KINDS.map((k) => ({ kind: k, rows: equipment.filter((e) => e.kind === k) })).filter((g) => g.rows.length)

  /* ── Exclusions ── */
  const [exCode, setExCode] = useState('')
  const [exReason, setExReason] = useState('')
  const [exEquip, setExEquip] = useState('')
  const addExclusion = async () => {
    if (await run(() => saveExclusion({ storeId: store.id, itemCode: exCode, reason: exReason, equipmentId: exEquip || null }))) { setExCode(''); setExReason(''); setExEquip('') }
  }

  const info = (label: string, value: React.ReactNode) => (
    <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-0.5 text-sm text-slate-800">{value || <span className="text-slate-300">Not recorded</span>}</dd></div>
  )

  return (
    <PmPage
      title={`Store ${store.storeNumber}`}
      subtitle={<>
        <Link href="/app/pm/stores" className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><ArrowLeft size={13} /> Store Directory</Link>
        <span className="mx-2 text-slate-300">|</span>{address || 'No address on file'}
        {address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`ALDI ${address}`)}`} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-indigo-600 hover:underline">Map <ExternalLink size={11} /></a>}
      </>}
      actions={<>
        {!store.isActive && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">Inactive</span>}
        {canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={13} /> Edit store</Button>}
      </>}>
      <ErrorNote>{error}</ErrorNote>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Store details" className="lg:col-span-2">
          <dl className="grid gap-4 p-4 sm:grid-cols-3">
            {info('ALDI facility manager', store.facilityManager)}
            {info('FM phone', store.fmPhone && <a href={`tel:${store.fmPhone}`} className="text-indigo-600 hover:underline">{store.fmPhone}</a>)}
            {info('FM email', store.fmEmail && <a href={`mailto:${store.fmEmail}`} className="text-indigo-600 hover:underline">{store.fmEmail}</a>)}
            {info('Primary technician', techName(store.primaryTechId))}
            {info('Secondary technician', techName(store.secondaryTechId))}
            {info('Store phone', store.storePhone && <a href={`tel:${store.storePhone}`} className="text-indigo-600 hover:underline">{store.storePhone}</a>)}
            {info('Refrigeration system', store.systemType ? SYSTEM_LABEL[store.systemType] : null)}
            {info('Refrigerant', store.refrigerant)}
            {info('Region', store.region)}
            {info('County', store.county)}
            <div className="sm:col-span-2">{info('Other contact info', store.contactNotes)}</div>
            <div className="sm:col-span-3">{info('Store notes', store.notes && <span className="whitespace-pre-wrap">{store.notes}</span>)}</div>
          </dl>
        </Card>
        <Card title="At a glance">
          <div className="grid grid-cols-2 gap-3 p-4">
            <div><p className="text-2xl font-bold tabular-nums text-slate-900">{cycles.length}</p><p className="text-xs text-slate-500">Quarterly PMs on record</p></div>
            <div><p className={cn('text-2xl font-bold tabular-nums', openDefs ? 'text-rose-700' : 'text-slate-900')}>{openDefs}</p><p className="text-xs text-slate-500">Open deficiencies</p></div>
            <div><p className="text-2xl font-bold tabular-nums text-slate-900">{equipment.filter((e) => e.isActive).length}</p><p className="text-xs text-slate-500">Equipment items</p></div>
            <div><p className="text-2xl font-bold tabular-nums text-slate-900">{exclusions.length}</p><p className="text-xs text-slate-500">Checks excluded here</p></div>
          </div>
          {!store.systemType && <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-amber-700">The refrigeration system is not recorded, so every check shows on this store&apos;s PMs, including ones for other refrigerants.</p>}
        </Card>
      </div>

      {/* ── Quarterly history ── */}
      <Card title="Quarterly PM history" id="history" actions={canEdit && (
        <span className="flex items-center gap-1.5">
          <select value={addQuarter} onChange={(e) => setAddQuarter(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Q{n}</option>)}</select>
          <input type="number" value={addYear} onChange={(e) => setAddYear(Number(e.target.value))} className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
          <Button size="sm" variant="outline" onClick={addCycle}><Plus size={13} /> Add PM</Button>
        </span>
      )}>
        {cycles.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-400">No PMs recorded for this store yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Quarter</th><th className="px-3 py-2">Job number</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Technician</th>
                <th className="px-3 py-2">Scheduled</th><th className="px-3 py-2">Completed</th><th className="px-3 py-2">Checklist</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cycles.map((c) => {
                  const old = (numbersByPm.get(c.id) ?? []).filter((j) => !j.isCurrent)
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2"><Link href={`/app/pm/jobs/${c.id}`} className="font-semibold text-indigo-700 hover:underline">Q{c.quarter} {c.year}</Link></td>
                      <td className="px-3 py-2">
                        {c.jobNumber ? <span className="font-semibold text-slate-900">{c.jobNumber}</span> : <span className="text-slate-400">Not received yet</span>}
                        {old.length > 0 && <span className="block text-[11px] text-slate-400">Earlier: {old.map((j) => j.jobNumber).join(', ')}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2"><span className="inline-flex items-center gap-1.5"><StatusChip status={c.status} /><BlockerChips cycle={c} compact /></span></td>
                      <td className="whitespace-nowrap px-3 py-2">{techName(c.techId) ?? <span className="text-slate-300">Unassigned</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(c.scheduledDate, today)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(c.actualEnd, today)}</td>
                      <td className="px-3 py-2">{c.templateVersionId ? <div className="w-28"><ProgressBar value={cyclePct(c)} small /></div> : <span className="text-xs text-slate-300">Not started</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {jobNumbers.length > 0 && (
          <details className="border-t border-slate-100 px-4 py-2.5 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">Every job number this store has carried ({jobNumbers.length})</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {jobNumbers.map((j) => {
                const c = cycles.find((x) => x.id === j.pmId)
                return (
                  <li key={j.id} className="flex flex-wrap gap-x-3">
                    <span className={cn('font-semibold', j.isCurrent ? 'text-slate-900' : 'text-slate-400 line-through')}>{j.jobNumber}</span>
                    <span>{c ? `Q${c.quarter} ${c.year}` : 'PM removed'}</span>
                    <span>entered {fmtDate(j.enteredAt, today)}{j.enteredBy && names[j.enteredBy] ? ` by ${names[j.enteredBy]}` : ''}</span>
                    {!j.isCurrent && j.supersededAt && <span>replaced {fmtDate(j.supersededAt, today)}</span>}
                  </li>
                )
              })}
            </ul>
          </details>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Equipment ── */}
        <Card title="Equipment at this store" actions={canEdit && <Button size="sm" variant="outline" onClick={() => setEq({ kind: 'circuit', label: '', manufacturer: '', model: '', serialNumber: '', refrigerant: '', notes: '' })}><Plus size={13} /> Add</Button>}>
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            Circuits and compressors listed here become the rows of the PM data entry tables. With none listed, the rows printed on the ALDI sheet are used.
          </p>
          {eq && (
            <div className="space-y-2 border-b border-slate-100 bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <select value={eq.kind} onChange={(e) => setEq({ ...eq, kind: e.target.value as EquipmentKind })} className={fieldCls}>{KINDS.map((k) => <option key={k} value={k}>{EQUIPMENT_KIND_LABEL[k]}</option>)}</select>
                <input autoFocus value={eq.label} onChange={(e) => setEq({ ...eq, label: e.target.value })} placeholder="Name, e.g. A-5 Deli or Compressor 4" className={cn(fieldCls, 'sm:col-span-2')} />
                <input value={eq.manufacturer} onChange={(e) => setEq({ ...eq, manufacturer: e.target.value })} placeholder="Manufacturer" className={fieldCls} />
                <input value={eq.model} onChange={(e) => setEq({ ...eq, model: e.target.value })} placeholder="Model" className={fieldCls} />
                <input value={eq.serialNumber} onChange={(e) => setEq({ ...eq, serialNumber: e.target.value })} placeholder="Serial number" className={fieldCls} />
                <input value={eq.refrigerant} onChange={(e) => setEq({ ...eq, refrigerant: e.target.value })} placeholder="Refrigerant" className={fieldCls} />
                <input value={eq.notes} onChange={(e) => setEq({ ...eq, notes: e.target.value })} placeholder="Notes" className={cn(fieldCls, 'sm:col-span-2')} />
              </div>
              <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setEq(null)}>Cancel</Button><Button size="sm" onClick={saveEq}>{eq.id ? 'Save' : 'Add equipment'}</Button></div>
            </div>
          )}
          {byKind.length === 0 && !eq ? <p className="px-4 py-6 text-center text-sm text-slate-400">No equipment listed yet.</p> : byKind.map((g) => (
            <div key={g.kind} className="border-b border-slate-100 last:border-0">
              <p className="bg-slate-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{EQUIPMENT_KIND_LABEL[g.kind]} ({g.rows.length})</p>
              <ul className="divide-y divide-slate-100">
                {g.rows.map((e) => (
                  <li key={e.id} className={cn('flex items-center gap-2 px-4 py-2 text-sm', !e.isActive && 'opacity-50')}>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">{e.label}</span>
                      <span className="block truncate text-xs text-slate-500">{[e.manufacturer, e.model, e.serialNumber && `S/N ${e.serialNumber}`, e.refrigerant, e.notes].filter(Boolean).join(' · ')}</span>
                    </span>
                    {canEdit && <>
                      <button type="button" aria-label={`Edit ${e.label}`} onClick={() => setEq({ id: e.id, kind: e.kind, label: e.label, manufacturer: e.manufacturer ?? '', model: e.model ?? '', serialNumber: e.serialNumber ?? '', refrigerant: e.refrigerant ?? '', notes: e.notes ?? '' })} className="p-1 text-slate-400 hover:text-indigo-600"><Pencil size={13} /></button>
                      <button type="button" aria-label={`Remove ${e.label}`} onClick={() => { if (confirm(`Remove ${e.label} from this store?`)) void run(() => deleteEquipment({ id: e.id, storeId: store.id })) }} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>
                    </>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>

        {/* ── Exclusions ── */}
        <Card title="Checks that do not apply here">
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            A check excluded here is left off every PM at this store and does not count against progress. Each one needs a reason, and adding or removing one is recorded.
          </p>
          {exclusions.length === 0 ? <p className="px-4 py-5 text-center text-sm text-slate-400">Nothing is excluded for this store.</p> : (
            <ul className="divide-y divide-slate-100">
              {exclusions.map((x) => (
                <li key={x.id} className="flex items-start gap-2 px-4 py-2 text-sm">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">{x.itemCode}</span>
                  <span className="min-w-0 flex-1 text-slate-700">{x.reason}{x.equipmentId && <span className="block text-xs text-slate-400">Because of {equipment.find((e) => e.id === x.equipmentId)?.label ?? 'equipment since removed'}</span>}</span>
                  {canEdit && <button type="button" aria-label={`Stop excluding ${x.itemCode}`} onClick={() => { if (confirm(`Put ${x.itemCode} back on this store's checklist?`)) void run(() => deleteExclusion({ id: x.id, storeId: store.id })) }} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={exCode} onChange={(e) => setExCode(e.target.value)} className={fieldCls}>
                  <option value="">Pick a check</option>
                  {checkCodes.filter((c) => !exclusions.some((x) => x.itemCode === c.code)).map((c) => <option key={c.code} value={c.code}>{c.code}: {c.description.slice(0, 70)}</option>)}
                </select>
                <select value={exEquip} onChange={(e) => setExEquip(e.target.value)} className={fieldCls}>
                  <option value="">Not tied to equipment</option>
                  {equipment.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input value={exReason} onChange={(e) => setExReason(e.target.value)} placeholder="Why it does not apply here, e.g. No VFD on this condenser" className={fieldCls} />
                <Button size="sm" onClick={addExclusion} disabled={!exCode || !exReason.trim()}>Exclude</Button>
              </div>
              {checkCodes.length === 0 && <p className="text-xs text-slate-400">No checklist has been set up yet, so there are no checks to pick from.</p>}
            </div>
          )}
        </Card>
      </div>

      {/* ── Issue history ── */}
      <Card title={`Issue history (${deficiencies.length})`} id="issues">
        {deficiencies.length === 0 ? <Empty title="No deficiencies have been recorded at this store" /> : (
          <ul className="divide-y divide-slate-100">
            {deficiencies.map((d) => {
              const c = cycles.find((x) => x.id === d.pmId)
              return (
                <li key={d.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', SEVERITY_TONE[d.severity])}>{SEVERITY_LABEL[d.severity]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-slate-800">{d.itemCode && <span className="mr-1.5 font-bold">{d.itemCode}</span>}{d.description}</span>
                    <span className="block text-xs text-slate-500">
                      {[fmtDate(d.createdAt, today), c && `Q${c.quarter} ${c.year} PM`, d.equipmentLabel, d.followupJobNumber && `Follow-up job ${d.followupJobNumber}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', REPAIR_OPEN(d.repairStatus) ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>{REPAIR_LABEL[d.repairStatus]}</span>
                  {d.pmId && <Link href={`/app/pm/jobs/${d.pmId}#deficiencies`} className="text-xs font-medium text-indigo-600 hover:underline">Open</Link>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Recent activity"><ActivityList items={activity} names={names} /></Card>

      {editing && <StoreFormModal store={store} techs={techs} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh() }} />}
    </PmPage>
  )
}
