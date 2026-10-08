'use client'

// The technician's PM, built for a phone. Everything for the visit is on one
// page: the store, what is left, the checklist by section, the readings,
// materials, and deficiencies. Every tap saves itself, and the bar at the top
// always says whether the entries are safe.

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, CloudOff, Loader2, MapPin, PlayCircle, RefreshCw, RotateCcw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { computeProgress, fieldCompleteGaps, resumeItemId } from '@/lib/pm/progress'
import { fmtDate, quarterMonths } from '@/lib/pm/quarters'
import { opKey, type SyncOp } from '@/lib/pm/syncQueue'
import { SECTIONS } from '@/lib/pm/template'
import {
  MATERIAL_OPEN, MATERIAL_STATUS_LABEL, POST_FIELD_STATUSES, REPAIR_OPEN,
  type CheckResult, type CompletionRules, type PmAttachment, type PmCycle, type PmDeficiency, type PmEquipment, type PmExclusion, type PmMaterial,
  type PmReading, type PmResponse, type PmStatus, type PmStore, type TemplateItem, type TemplateVersion,
} from '@/lib/pm/types'
import { BlockerChips, ProgressBar, StatusChip } from '@/components/pm/ui'
import { ChecklistItem } from '@/components/pm/ChecklistItem'
import { ReadingTable, readingKey } from '@/components/pm/ReadingTables'
import { MaterialsPanel } from '@/components/pm/MaterialsPanel'
import { DeficienciesPanel, type DeficiencySeed } from '@/components/pm/DeficienciesPanel'
import { usePmSync } from '@/components/pm/usePmSync'
import { markFieldComplete } from '../../../actions'
import { deletePmAttachment, startChecklist, type SyncReply } from '../../../checklistActions'

interface Props {
  cycle: PmCycle; store: PmStore; template: TemplateVersion | null; items: TemplateItem[]
  responses: PmResponse[]; readings: PmReading[]; attachments: PmAttachment[]; materials: PmMaterial[]; deficiencies: PmDeficiency[]
  exclusions: PmExclusion[]; equipment: PmEquipment[]; rules: CompletionRules; reportCount: number
  canWork: boolean; canCoordinate: boolean; isAdmin: boolean; userId: string; techName: string | null
  names: Record<string, string>; today: string; checklistAvailable: boolean
}

const noop = () => () => {}
const GROUPS: { key: 'refrigeration' | 'electrical' | 'hvac'; label: string }[] = [
  { key: 'refrigeration', label: 'Refrigeration Data Entry' }, { key: 'electrical', label: 'Electrical Readings' }, { key: 'hvac', label: 'HVAC Data Entry' },
]

/** The autosave queue lives in the browser, so the checklist waits for it. */
export function ChecklistClient(props: Props) {
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  if (!mounted) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">Opening the PM</div>
  return <Checklist {...props} />
}

function Checklist({ cycle, store, template, items, exclusions, equipment, rules, canWork, canCoordinate, userId, techName, names, today, checklistAvailable, ...initial }: Props) {
  const router = useRouter()
  const [responses, setResponses] = useState<Record<string, PmResponse>>(() => Object.fromEntries(initial.responses.map((r) => [r.itemId, r])))
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(initial.readings.map((r) => [readingKey(r.tableKey, r.rowKey, r.colKey), r.value])))
  const [attachments, setAttachments] = useState(initial.attachments)
  const [materials, setMaterials] = useState(initial.materials)
  const [deficiencies, setDeficiencies] = useState(initial.deficiencies)
  const [status, setStatus] = useState<PmStatus>(cycle.status)
  const [techNotes, setTechNotes] = useState(cycle.techNotes ?? '')
  const [timeIn, setTimeIn] = useState(cycle.timeIn ?? '')
  const [timeOut, setTimeOut] = useState(cycle.timeOut ?? '')
  const [returnVisit, setReturnVisit] = useState(cycle.returnVisitNeeded)
  const [returnNote, setReturnNote] = useState(cycle.returnVisitNote ?? '')
  const [lastItemId, setLastItemId] = useState(cycle.lastItemId)
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set())
  const [focus, setFocus] = useState<string | null>(null)
  const [highlightTable, setHighlightTable] = useState<string | null>(null)
  const [seed, setSeed] = useState<DeficiencySeed | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string; gaps?: string[] } | null>(null)

  const sync = usePmSync(cycle.id, {
    onReply: (reply: SyncReply) => {
      setStatus(reply.status)
      // Take the server's stamp (who, when, rev) without trampling newer typing.
      setResponses((cur) => {
        const next = { ...cur }
        for (const r of reply.responses) {
          const mine = cur[r.itemId]
          next[r.itemId] = mine ? { ...mine, rev: r.rev, inspectedAt: r.inspectedAt, inspectedBy: r.inspectedBy } : r
        }
        return next
      })
    },
    onUploaded: (added) => setAttachments((cur) => [...cur, ...added]),
  })

  const push = sync.push
  const locked = !canWork

  /* ── What the numbers are, right now, on this phone ── */
  const waitingPhotos = sync.photos.filter((p) => p.state !== 'failed')
  const progress = useMemo(() => {
    const photoCounts: Record<string, number> = {}
    for (const a of attachments) if (a.kind === 'photo' && a.itemId) photoCounts[a.itemId] = (photoCounts[a.itemId] ?? 0) + 1
    for (const p of waitingPhotos) if (p.itemId) photoCounts[p.itemId] = (photoCounts[p.itemId] ?? 0) + 1
    return computeProgress({
      items, system: store.systemType, exclusions, responses: Object.values(responses), photoCounts,
      readings: Object.entries(values).map(([k, value]) => { const [tableKey, , colKey] = k.split('|'); return { tableKey, colKey, value } }),
      deficiencyItemIds: deficiencies.filter((d) => d.itemId).map((d) => d.itemId as string), techNotes, rules,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, store.systemType, exclusions, responses, attachments, sync.photos, values, deficiencies, techNotes, rules])

  const openMaterials = materials.filter((m) => MATERIAL_OPEN(m.status))
  const flags = {
    waitingFilters: openMaterials.some((m) => m.category === 'filter'), waitingParts: openMaterials.some((m) => m.category !== 'filter'),
    returnVisitNeeded: returnVisit, blockingDeficiencies: deficiencies.filter((d) => d.affectsPm && REPAIR_OPEN(d.repairStatus)).length,
  }
  const gaps = fieldCompleteGaps(progress, flags, rules)
  const openDefs = deficiencies.filter((d) => REPAIR_OPEN(d.repairStatus))
  const fieldDone = POST_FIELD_STATUSES.includes(status)
  const sectionOrder = useMemo(() => {
    const seen = new Set<string>()
    const keys = items.map((i) => i.sectionKey).filter((k) => !seen.has(k) && !!seen.add(k))
    return keys.sort((a, b) => { const ia = SECTIONS.findIndex((s) => s.key === a); const ib = SECTIONS.findIndex((s) => s.key === b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) })
  }, [items])

  /* ── Changing things ── */
  const touch = useCallback((itemId: string) => { setLastItemId(itemId); push({ kind: 'pm', patch: { lastItemId: itemId } }) }, [push])
  const patchResponse = (itemId: string, patch: Partial<PmResponse>, op: Extract<SyncOp, { kind: 'response' }>['patch']) => {
    const blank: PmResponse = { itemId, result: null, measureValue: null, note: null, naReason: null, inspectedBy: null, inspectedAt: null, rev: 0 }
    setResponses((all) => ({ ...all, [itemId]: { ...(all[itemId] ?? blank), ...patch } }))
    // rev 0 means the server has never seen this check from this phone.
    push({ kind: 'response', itemId, patch: op, baseRev: responses[itemId]?.rev ? responses[itemId].rev : null })
  }

  const setResult = (item: TemplateItem, result: CheckResult | null, naReason?: string) => {
    patchResponse(item.id, { result, naReason: result === 'na' ? naReason ?? null : null, inspectedBy: result ? userId : null, inspectedAt: result ? new Date().toISOString() : null }, { result, naReason: result === 'na' ? naReason ?? null : null })
    touch(item.id)
    setFocus(null)
  }
  const setReading = (table: string, row: string, col: string, value: string) => {
    setValues((cur) => ({ ...cur, [readingKey(table, row, col)]: value }))
    push({ kind: 'reading', table, row, col, value })
  }
  const pmPatch = (patch: Extract<SyncOp, { kind: 'pm' }>['patch']) => push({ kind: 'pm', patch })

  const jumpTo = (itemId: string) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    setOpenSections((cur) => new Set(cur).add(item.sectionKey))
    setFocus(itemId)
    setTimeout(() => document.getElementById(`pm-item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }
  const resume = () => {
    const next = resumeItemId(progress, lastItemId)
    if (next) jumpTo(next)
    else document.getElementById('pm-finish')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const goToReadings = (table: string) => {
    setHighlightTable(table)
    setTimeout(() => document.getElementById(`pm-table-${table}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    setTimeout(() => setHighlightTable((cur) => (cur === table ? null : cur)), 4000)
  }
  const writeUp = (item: TemplateItem) => {
    setSeed({ itemId: item.id, itemCode: item.code, description: responses[item.id]?.note ?? '', proposalRequired: item.fopmOnFail })
    setTimeout(() => document.getElementById('pm-deficiencies')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  const removePhoto = async (a: PmAttachment) => {
    if (!confirm('Remove this photo?')) return
    const res = await deletePmAttachment({ id: a.id })
    if (!res.ok) { setNotice({ tone: 'bad', text: res.error }); return }
    setAttachments((cur) => cur.filter((x) => x.id !== a.id))
  }

  const start = async () => {
    setBusy(true); setNotice(null)
    const res = await startChecklist({ pmId: cycle.id })
    setBusy(false)
    if (!res.ok) { setNotice({ tone: 'bad', text: res.error }); return }
    router.refresh()
  }
  const finish = async () => {
    if (sync.summary.state !== 'saved') { setNotice({ tone: 'bad', text: 'Some entries have not reached the server yet. Wait for "All entries saved" and try again.' }); return }
    setBusy(true); setNotice(null)
    const res = await markFieldComplete({ id: cycle.id })
    setBusy(false)
    if (!res.ok) { setNotice({ tone: 'bad', text: res.error, gaps: 'gaps' in res ? res.gaps : undefined }); return }
    setStatus('field_complete')
    setNotice({ tone: 'good', text: 'Field work marked complete. The coordinator has been told.' })
  }

  const pill = {
    saved: { cls: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 size={13} /> },
    saving: { cls: 'bg-slate-100 text-slate-700', icon: <Loader2 size={13} className="animate-spin" /> },
    offline: { cls: 'bg-amber-100 text-amber-900', icon: <WifiOff size={13} /> },
    failed: { cls: 'bg-rose-100 text-rose-800', icon: <CloudOff size={13} /> },
    conflict: { cls: 'bg-amber-100 text-amber-900', icon: <AlertTriangle size={13} /> },
  }[sync.summary.state]
  const address = [store.address, store.city, store.state].filter(Boolean).join(', ')
  const resumeTarget = resumeItemId(progress, lastItemId)
  const comments = progress.evals.filter((e) => e.counted && (responses[e.item.id]?.note || responses[e.item.id]?.measureValue))

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {/* ── Always in view: where am I, and are my entries safe ── */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-3 pb-2 pt-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <Link href={`/app/pm/jobs/${cycle.id}`} aria-label="Back to the PM" className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18} /></Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold leading-tight text-slate-900">Store {store.storeNumber}</p>
            <p className="truncate text-[11px] text-slate-500">Q{cycle.quarter} {cycle.year} · {cycle.jobNumber ? `Job ${cycle.jobNumber}` : 'No job number yet'}</p>
          </div>
          <button type="button" onClick={sync.retry} data-help="pm-sync" title="Tap to save now"
            className={cn('inline-flex max-w-[55%] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', pill.cls)}>
            {pill.icon}<span className="truncate">{sync.summary.label}</span>
          </button>
        </div>
        {template && (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1"><ProgressBar value={progress.checklistPct} showValue={false} /></div>
            <span className="shrink-0 text-xs font-bold tabular-nums text-slate-800">{progress.checklistPct}%</span>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{progress.checklistDone}/{progress.checklistTotal}</span>
          </div>
        )}
      </header>

      <div className="space-y-3 p-3 sm:p-4">
        {locked && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
            {status === 'completed' || status === 'cancelled' ? 'This PM is closed. You can read it, but it can no longer be changed.' : 'You can read this PM. Only the assigned technician or a coordinator can fill it in.'}
          </p>
        )}

        {/* ── The visit at a glance ── */}
        <section className="rounded-xl border border-slate-200 bg-white" data-help="pm-work-summary">
          <div className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-1.5"><StatusChip status={status} /><BlockerChips cycle={flags} /></div>
            {address && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`ALDI ${address}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5 text-sm font-medium text-indigo-700">
                <MapPin size={15} className="mt-0.5 shrink-0" />{address}
              </a>
            )}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-4">
              <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Job number</dt><dd className="font-semibold text-slate-900">{cycle.jobNumber ?? <span className="font-normal italic text-slate-400">Not received yet</span>}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Quarter</dt><dd className="font-semibold text-slate-900">Q{cycle.quarter} {cycle.year}<span className="block text-[11px] font-normal text-slate-500">{quarterMonths(cycle.quarter)}</span></dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Technician</dt><dd className="font-semibold text-slate-900">{techName ?? <span className="font-normal text-slate-400">Unassigned</span>}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Due</dt><dd className={cn('font-semibold', cycle.dueDate && cycle.dueDate < today && !fieldDone ? 'text-rose-700' : 'text-slate-900')}>{fmtDate(cycle.dueDate, today) || <span className="font-normal text-slate-400">Not set</span>}</dd></div>
            </dl>
            {template && (
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-lg font-bold tabular-nums text-slate-900">{progress.uninspected + progress.incomplete}</p><p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Checks left</p></div>
                <div className={cn('rounded-lg p-2', openMaterials.length ? 'bg-amber-50' : 'bg-slate-50')}><p className="text-lg font-bold tabular-nums text-slate-900">{openMaterials.length}</p><p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Materials out</p></div>
                <div className={cn('rounded-lg p-2', openDefs.length ? 'bg-rose-50' : 'bg-slate-50')}><p className="text-lg font-bold tabular-nums text-slate-900">{openDefs.length}</p><p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Open issues</p></div>
              </div>
            )}
            {openMaterials.length > 0 && (
              <ul className="space-y-0.5 text-xs text-slate-600">
                {openMaterials.slice(0, 4).map((m) => <li key={m.id} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{m.quantity} x {m.name}</span><span className="font-semibold text-slate-500">{MATERIAL_STATUS_LABEL[m.status]}</span></li>)}
              </ul>
            )}
            {template && <ProgressBar value={progress.docsPct} label={`Required photos, readings, and notes ${progress.docsDone}/${progress.docsTotal}`} tone="violet" small />}
          </div>
          {template && canWork && !fieldDone && (
            <div className="border-t border-slate-100 p-3">
              <button type="button" onClick={resume} data-help="pm-resume"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-bold text-white shadow-sm hover:bg-indigo-700">
                <PlayCircle size={20} /> {progress.checklistDone === 0 && !lastItemId ? 'Start the checklist' : resumeTarget ? 'Resume where I left off' : 'Everything is inspected. Go to finish'}
              </button>
              {resumeTarget && <p className="mt-1.5 text-center text-[11px] text-slate-500">Next: {items.find((i) => i.id === resumeTarget)?.code}</p>}
            </div>
          )}
        </section>

        {notice && (
          <div className={cn('rounded-xl border px-3 py-2.5 text-sm', notice.tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-800')}>
            <p className="font-semibold">{notice.text}</p>
            {notice.gaps && <ul className="mt-1 list-disc pl-5 text-xs">{notice.gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
          </div>
        )}

        {/* ── No checklist attached yet ── */}
        {!template && (
          <section className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 p-4 text-center">
            {checklistAvailable ? (
              <>
                <p className="text-sm font-semibold text-slate-800">The Q{cycle.quarter} checklist is ready for this store.</p>
                <p className="mt-1 text-xs text-slate-600">Starting it ties this PM to the checklist as it stands today, so a later revision cannot change what you recorded.</p>
                {canWork && <Button className="mt-3" onClick={start} loading={busy}>Start the checklist</Button>}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-800">No Q{cycle.quarter} checklist has been published yet.</p>
                <p className="mt-1 text-xs text-slate-600">An administrator sets it up under Preventative Maintenance, Settings, Checklist Templates. Materials and deficiencies below still work in the meantime.</p>
                {canCoordinate && <Link href="/app/pm/settings" className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Open Checklist Templates</Link>}
              </>
            )}
          </section>
        )}

        {/* ── The checklist ── */}
        {template && sectionOrder.map((key) => {
          const sec = progress.sections.find((s) => s.key === key)
          const list = progress.evals.filter((e) => e.item.sectionKey === key)
          const isOpen = openSections.has(key)
          const complete = !!sec && sec.total > 0 && sec.done === sec.total
          return (
            <section key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpenSections((cur) => { const next = new Set(cur); if (next.has(key)) next.delete(key); else next.add(key); return next })}
                className="flex w-full items-center gap-3 px-3 py-3.5 text-left">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', complete ? 'bg-emerald-500 text-white' : sec?.fails ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600')}>{complete ? <CheckCircle2 size={16} /> : sec?.total ? sec.total - sec.done : 0}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{list[0]?.item.sectionLabel ?? key}</span>
                  <span className="mt-1 block"><ProgressBar value={sec?.pct ?? 0} small showValue={false} /></span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">{sec?.done ?? 0}/{sec?.total ?? 0}</span>
                <ChevronDown size={18} className={cn('shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="space-y-2.5 border-t border-slate-100 bg-slate-50 p-2.5">
                  {list.map((ev) => (
                    <ChecklistItem key={ev.item.id} item={ev.item} ev={ev} response={responses[ev.item.id]} canWork={canWork} names={names} focused={focus === ev.item.id}
                      photos={attachments.filter((a) => a.itemId === ev.item.id && a.kind === 'photo')} pending={sync.photos.filter((p) => p.itemId === ev.item.id)}
                      deficiencies={deficiencies.filter((d) => d.itemId === ev.item.id)}
                      entry={sync.queue[opKey({ kind: 'response', itemId: ev.item.id, patch: {}, baseRev: null })]}
                      onResult={(r, why) => setResult(ev.item, r, why)}
                      onNote={(text) => patchResponse(ev.item.id, { note: text }, { note: text })}
                      onMeasure={(text) => patchResponse(ev.item.id, { measureValue: text }, { measureValue: text })}
                      onAddPhotos={(files) => { void sync.addPhotos(files, { itemId: ev.item.id }); touch(ev.item.id) }}
                      onRemovePhoto={removePhoto} onDropPending={(id) => void sync.dropPhoto(id)}
                      onDeficiency={() => writeUp(ev.item)} onGoToReadings={goToReadings}
                      onRetry={sync.retry}
                      onResolve={(keep) => {
                        const k = opKey({ kind: 'response', itemId: ev.item.id, patch: {}, baseRev: null })
                        const theirs = sync.queue[k]?.server
                        if (keep === 'theirs' && theirs) setResponses((cur) => ({ ...cur, [ev.item.id]: theirs }))
                        else if (theirs) setResponses((cur) => ({ ...cur, [ev.item.id]: { ...cur[ev.item.id], rev: theirs.rev } }))
                        sync.resolve(k, keep)
                      }} />
                  ))}
                </div>
              )}
            </section>
          )
        })}

        {/* ── Readings ── */}
        {template && GROUPS.map((g) => {
          const tables = template.dataTables.filter((t) => t.group === g.key)
          if (!tables.length) return null
          return (
            <section key={g.key} className="space-y-2">
              <h2 className="px-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{g.label}</h2>
              {tables.map((t) => <ReadingTable key={t.key} table={t} layout={cycle.layout} values={values} onChange={setReading} readOnly={locked} highlight={highlightTable === t.key} />)}
            </section>
          )
        })}

        {/* ── Comments, the last page of the sheet ── */}
        <section className="rounded-xl border border-slate-200 bg-white" data-help="pm-tech-notes">
          <h2 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">Service Technician Comments</h2>
          <div className="space-y-3 p-3">
            {comments.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                {comments.map((e) => {
                  const r = responses[e.item.id]
                  return (
                    <li key={e.item.id} className="flex gap-2 px-2.5 py-1.5">
                      <button type="button" onClick={() => jumpTo(e.item.id)} className="shrink-0 font-bold text-indigo-700">{e.item.code}</button>
                      <span className="min-w-0 flex-1 text-slate-700">{[r?.measureValue && `${e.item.measureLabel ?? 'Value'} ${r.measureValue}${e.item.measureUnit ?? ''}`, r?.note].filter(Boolean).join('. ')}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Technician notes for the visit</span>
              <textarea rows={4} disabled={locked} value={techNotes} onChange={(e) => { setTechNotes(e.target.value); pmPatch({ techNotes: e.target.value }) }}
                placeholder="Anything the coordinator or the next technician should know" className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-base outline-none focus:border-indigo-400 disabled:bg-slate-50 sm:text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Time in</span>
                <input type="time" disabled={locked} value={timeIn} onChange={(e) => { setTimeIn(e.target.value); pmPatch({ timeIn: e.target.value }) }} className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-base outline-none focus:border-indigo-400 disabled:bg-slate-50 sm:text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Time out</span>
                <input type="time" disabled={locked} value={timeOut} onChange={(e) => { setTimeOut(e.target.value); pmPatch({ timeOut: e.target.value }) }} className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-base outline-none focus:border-indigo-400 disabled:bg-slate-50 sm:text-sm" /></label>
            </div>
          </div>
        </section>

        {/* ── Materials and deficiencies ── */}
        <section id="pm-materials" className="scroll-mt-28 rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">Filters and parts</h2>
          <MaterialsPanel pmId={cycle.id} materials={materials} onChange={setMaterials} canWork={canWork} canCoordinate={canCoordinate} userId={userId} equipment={equipment} names={names} today={today} big />
        </section>
        <section id="pm-deficiencies" className="scroll-mt-28 rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-900">Deficiencies</h2>
          <DeficienciesPanel pmId={cycle.id} storeId={store.id} deficiencies={deficiencies} onChange={setDeficiencies} attachments={attachments} canWork={canWork} canCoordinate={canCoordinate}
            equipment={equipment} names={names} today={today} seed={seed} onSeedUsed={() => setSeed(null)} big
            onAddPhotos={(files, id) => void sync.addPhotos(files, { deficiencyId: id })} pendingPhotoCount={(id) => sync.photos.filter((p) => p.deficiencyId === id).length} />
        </section>

        {/* ── Finish ── */}
        {template && (
          <section id="pm-finish" className="scroll-mt-28 space-y-3 rounded-xl border border-slate-200 bg-white p-3" data-help="pm-field-complete">
            <h2 className="text-sm font-semibold text-slate-900">Finish the visit</h2>
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5 h-5 w-5" disabled={locked} checked={returnVisit} onChange={(e) => { setReturnVisit(e.target.checked); pmPatch({ returnVisitNeeded: e.target.checked }) }} />
              <span><span className="flex items-center gap-1.5 font-semibold"><RotateCcw size={14} /> A return visit is needed to finish this PM</span><span className="block text-xs text-slate-500">Tick this when part of the inspection could not be done today. The coordinator is told.</span></span>
            </label>
            {returnVisit && (
              <textarea rows={2} disabled={locked} value={returnNote} onChange={(e) => { setReturnNote(e.target.value); pmPatch({ returnVisitNote: e.target.value }) }}
                placeholder="What is left, and what is needed to finish it" className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-base outline-none focus:border-indigo-400 sm:text-sm" />
            )}
            {fieldDone ? (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800"><CheckCircle2 size={16} /> Field work is complete{cycle.fieldCompletedAt ? `, ${fmtDate(cycle.fieldCompletedAt, today)}` : ''}.</p>
            ) : (
              <>
                {gaps.length > 0 ? (
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-xs font-semibold text-slate-700">Still to do before the field work is complete</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
                  </div>
                ) : <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">Every check is inspected, with its photos and readings. Ready to finish.</p>}
                {canWork && (
                  <button type="button" onClick={finish} disabled={busy || gaps.length > 0}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-bold text-white disabled:bg-slate-300">
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Mark field work complete
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* ── Thumb reach: resume from anywhere on the page ── */}
      {template && canWork && !fieldDone && resumeTarget && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-2.5 backdrop-blur md:left-auto md:right-6 md:bottom-6 md:w-auto md:rounded-xl md:border md:shadow-lg print:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <button type="button" onClick={resume} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white md:px-5">
              <PlayCircle size={17} /> Resume: {items.find((i) => i.id === resumeTarget)?.code}
            </button>
            {sync.summary.state !== 'saved' && <button type="button" onClick={sync.retry} aria-label="Save now" className="rounded-xl border border-slate-300 p-3 text-slate-600"><RefreshCw size={17} /></button>}
          </div>
        </div>
      )}
    </div>
  )
}
