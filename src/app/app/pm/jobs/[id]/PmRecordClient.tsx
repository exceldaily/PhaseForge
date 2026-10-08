'use client'

// One store's PM for one quarter: the record a coordinator works from. The
// job number and schedule, where it stands, what is holding it up, and
// everything that hangs off it. The checklist itself opens on its own screen.

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, FileText, Lock, Paperclip, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { SectionProgress } from '@/lib/pm/progress'
import { addBusinessDays, fmtDate, quarterMonths } from '@/lib/pm/quarters'
import {
  MANUAL_STATUSES, MATERIAL_OPEN, POST_FIELD_STATUSES, PRIORITIES, REPAIR_OPEN, STATUS_LABEL, SYSTEM_LABEL,
  type CompletionRules, type PmActivity, type PmAttachment, type PmCycle, type PmDeficiency, type PmEquipment, type PmMaterial,
  type PmStatus, type PmStore, type PmTech, type TemplateVersion,
} from '@/lib/pm/types'
import { ActivityList } from '@/components/pm/ActivityList'
import { DeficienciesPanel } from '@/components/pm/DeficienciesPanel'
import { MaterialsPanel } from '@/components/pm/MaterialsPanel'
import { BlockerChips, Card, CycleBars, ErrorNote, Field, OverdueChip, PmPage, ProgressBar, StatusChip, fieldCls } from '@/components/pm/ui'
import { completePm, deleteCycle, markFieldComplete, moveCycle, reopenPm, updateCycle, type CyclePatch } from '../../actions'
import { deletePmAttachment, uploadPmFiles } from '../../checklistActions'
import { generatePmReport } from '../../reportActions'

export interface JobNumberRow { id: string; pmId: string; jobNumber: string; receivedDate: string | null; isCurrent: boolean; enteredBy: string | null; enteredAt: string; supersededAt: string | null }
export interface ReportRow { id: string; version: number; path: string; sizeBytes: number | null; checklistDone: number | null; checklistTotal: number | null; generatedBy: string | null; generatedAt: string; url?: string | null }

type Draft = {
  jobNumber: string; scWorkOrder: string; jobReceivedDate: string; priority: string; dueDate: string; techId: string; helperTechId: string
  scheduledDate: string; actualStart: string; actualEnd: string; timeIn: string; timeOut: string; serviceProvider: string; fmSpotChecked: string
  status: PmStatus; statusNote: string; returnVisitNeeded: boolean; returnVisitNote: string; submittedOn: string; coordinatorNotes: string; techNotes: string
}
const toDraft = (c: PmCycle): Draft => ({
  jobNumber: c.jobNumber ?? '', scWorkOrder: c.scWorkOrder ?? '', jobReceivedDate: c.jobReceivedDate ?? '', priority: c.priority ?? '', dueDate: c.dueDate ?? '',
  techId: c.techId ?? '', helperTechId: c.helperTechId ?? '', scheduledDate: c.scheduledDate ?? '', actualStart: c.actualStart ?? '', actualEnd: c.actualEnd ?? '',
  timeIn: c.timeIn ?? '', timeOut: c.timeOut ?? '', serviceProvider: c.serviceProvider ?? '', fmSpotChecked: c.fmSpotChecked === null ? '' : c.fmSpotChecked ? 'yes' : 'no',
  status: c.status, statusNote: c.statusNote ?? '', returnVisitNeeded: c.returnVisitNeeded, returnVisitNote: c.returnVisitNote ?? '', submittedOn: c.submittedOn ?? '',
  coordinatorNotes: c.coordinatorNotes ?? '', techNotes: c.techNotes ?? '',
})
const size = (n: number | null) => (!n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

const JOB: (keyof Draft)[] = ['jobNumber', 'scWorkOrder', 'jobReceivedDate', 'priority', 'dueDate']
const SCHEDULE: (keyof Draft)[] = ['techId', 'helperTechId', 'scheduledDate', 'actualStart', 'actualEnd', 'timeIn', 'timeOut', 'serviceProvider', 'fmSpotChecked']
const STATUS: (keyof Draft)[] = ['status', 'statusNote', 'returnVisitNeeded', 'returnVisitNote', 'submittedOn']
const NOTES: (keyof Draft)[] = ['coordinatorNotes', 'techNotes']

export function PmRecordClient({
  cycle, store, template, attachments: initialAttachments, materials: initialMaterials, deficiencies: initialDeficiencies, equipment, rules,
  sections, counts, fieldGaps, closeGaps, techs, jobNumbers, reports, activity, names, canWork, canCoordinate, isAdmin, userId, today, checklistAvailable,
}: {
  cycle: PmCycle; store: PmStore; template: TemplateVersion | null
  attachments: PmAttachment[]; materials: PmMaterial[]; deficiencies: PmDeficiency[]; equipment: PmEquipment[]; rules: CompletionRules
  sections: SectionProgress[]
  counts: { fails: number; failsUnlinked: number; uninspected: number; incomplete: number }
  fieldGaps: string[]; closeGaps: string[]
  techs: PmTech[]; jobNumbers: JobNumberRow[]; reports: ReportRow[]; activity: PmActivity[]; names: Record<string, string>
  canWork: boolean; canCoordinate: boolean; isAdmin: boolean; userId: string; today: string; checklistAvailable: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => toDraft(cycle))
  // When the server copy changes (a save, a refresh), untouched fields follow
  // it and anything typed but not saved yet is kept.
  const [base, setBase] = useState(cycle)
  if (base !== cycle) {
    const was = toDraft(base)
    const now = toDraft(cycle)
    setBase(cycle)
    setDraft((d) => Object.fromEntries((Object.keys(now) as (keyof Draft)[]).map((k) => [k, d[k] === was[k] ? now[k] : d[k]])) as Draft)
  }
  const [materials, setMaterials] = useState(initialMaterials)
  const [deficiencies, setDeficiencies] = useState(initialDeficiencies)
  const [attachments, setAttachments] = useState(initialAttachments)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [gaps, setGaps] = useState<string[] | null>(null)
  const [override, setOverride] = useState('')
  const [reopening, setReopening] = useState(false)
  const [reopenWhy, setReopenWhy] = useState('')
  const [moveYear, setMoveYear] = useState(cycle.year)
  const [moveQuarter, setMoveQuarter] = useState(cycle.quarter)
  const fileRef = useRef<HTMLInputElement>(null)

  const closed = cycle.status === 'completed' || cycle.status === 'cancelled'
  const edit = canCoordinate && cycle.status !== 'completed'
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const original = useMemo(() => toDraft(cycle), [cycle])
  const dirty = (keys: (keyof Draft)[]) => keys.some((k) => draft[k] !== original[k])
  const address = [store.address, store.city, store.state, store.postalCode].filter(Boolean).join(', ')
  const techName = (id: string | null) => techs.find((t) => t.id === id)?.name ?? null
  const activeTechs = techs.filter((t) => t.isActive || t.id === cycle.techId || t.id === cycle.helperTechId)

  // Priority and the date the job came in suggest a due date. Only ever a suggestion.
  const days = PRIORITIES.find((p) => p.key === draft.priority)?.businessDays ?? null
  const suggestedDue = draft.jobReceivedDate && days ? addBusinessDays(draft.jobReceivedDate, days) : null

  const run = async <T extends { ok: boolean; error?: string }>(key: string, fn: () => Promise<T>): Promise<T> => {
    setBusy(key); setError(null); setNote(null)
    const res = await fn()
    setBusy(null)
    if (!res.ok) setError(res.error ?? 'That did not save.')
    else router.refresh()
    return res
  }

  const patchOf = (keys: (keyof Draft)[]): CyclePatch => {
    const p: Record<string, unknown> = {}
    for (const k of keys) {
      if (draft[k] === original[k]) continue
      if (k === 'fmSpotChecked') p[k] = draft[k] === '' ? null : draft[k] === 'yes'
      else if (k === 'returnVisitNeeded' || k === 'status') p[k] = draft[k]
      else p[k] = (draft[k] as string) || null
    }
    return p as CyclePatch
  }
  const save = async (key: string, keys: (keyof Draft)[]) => {
    const patch = patchOf(keys)
    if (!Object.keys(patch).length) return
    const res = await run(key, () => updateCycle({ id: cycle.id, patch }))
    if (res.ok) { setNote('Saved.'); return }
    // The same job number on another PM: an administrator can confirm it is right.
    if ('duplicateJob' in res && res.duplicateJob?.canOverride && confirm(`${res.error}\n\nUse it on this PM as well?`)) {
      const again = await run(key, () => updateCycle({ id: cycle.id, patch, allowDuplicateJob: true }))
      if (again.ok) setNote('Saved.')
    }
  }

  const fieldDone = async () => {
    const res = await run('field', () => markFieldComplete({ id: cycle.id }))
    if (!res.ok && 'gaps' in res && res.gaps) setGaps(res.gaps)
    if (res.ok) { setGaps(null); setNote('Marked Field Work Complete.') }
  }
  const complete = async (withOverride: boolean) => {
    const res = await run('complete', () => completePm({ id: cycle.id, overrideReason: withOverride ? override : null }))
    if (!res.ok && 'gaps' in res && res.gaps) setGaps(res.gaps)
    if (res.ok) { setGaps(null); setOverride(''); setNote('PM completed.') }
  }
  const reopen = async () => {
    const res = await run('reopen', () => reopenPm({ id: cycle.id, reason: reopenWhy }))
    if (res.ok) { setReopening(false); setReopenWhy(''); setNote('Reopened. Nothing recorded was lost.') }
  }
  const report = async () => {
    const res = await run('report', () => generatePmReport({ pmId: cycle.id }))
    if (res.ok && 'version' in res) {
      setNote(`Report version ${res.version} is ready${res.photosLeftOut ? `. ${res.photosLeftOut} photo(s) were left out (JPG and PNG only, 36 at most)` : ''}. It is listed under PM reports.`)
    }
  }
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    const form = new FormData()
    form.set('pmId', cycle.id)
    for (const f of Array.from(files).slice(0, 12)) form.append('files', f)
    const res = await run('upload', () => uploadPmFiles(form))
    if (res.ok && 'attachments' in res) setAttachments((a) => [...a, ...res.attachments])
    if (fileRef.current) fileRef.current.value = ''
  }
  const removeFile = async (a: PmAttachment) => {
    if (!confirm(`Remove ${a.name}?`)) return
    const res = await run('upload', () => deletePmAttachment({ id: a.id }))
    if (res.ok) setAttachments((list) => list.filter((x) => x.id !== a.id))
  }
  const move = async () => {
    if (!confirm(`Move this PM to Q${moveQuarter} ${moveYear}? Everything recorded on it moves with it.`)) return
    await run('move', () => moveCycle({ id: cycle.id, year: moveYear, quarter: moveQuarter }))
  }
  const remove = async () => {
    if (!confirm(`Delete the Q${cycle.quarter} ${cycle.year} PM for store ${store.storeNumber}? Its checklist answers, readings, materials, and reports go with it. This cannot be undone.`)) return
    const res = await run('delete', () => deleteCycle({ id: cycle.id }))
    if (res.ok) router.push('/app/pm/tracker')
  }

  const looseFiles = attachments.filter((a) => !a.itemId && !a.deficiencyId)
  const checkPhotos = attachments.filter((a) => a.itemId && a.kind === 'photo').length
  const openMaterials = materials.filter((m) => MATERIAL_OPEN(m.status)).length
  const openDefs = deficiencies.filter((d) => REPAIR_OPEN(d.repairStatus)).length
  const started = !!cycle.templateVersionId
  const afterField = POST_FIELD_STATUSES.includes(cycle.status)
  const rulesOn = (Object.keys(rules) as (keyof CompletionRules)[]).filter((k) => rules[k]).length
  const shownGaps = gaps ?? (closeGaps.length && !closed && canCoordinate ? closeGaps : null)

  return (
    <PmPage
      title={`Store ${store.storeNumber}, Q${cycle.quarter} ${cycle.year}`}
      subtitle={<>
        <Link href="/app/pm/tracker" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"><ArrowLeft size={12} /> Quarterly Tracker</Link>
        <span className="mx-2 text-slate-300">|</span>
        <Link href={`/app/pm/stores/${store.id}`} className="hover:text-indigo-600 hover:underline">{address || 'Store profile'}</Link>
        <span className="mx-2 text-slate-300">|</span>{quarterMonths(cycle.quarter)}
        {store.systemType && <><span className="mx-2 text-slate-300">|</span>{SYSTEM_LABEL[store.systemType]}</>}
      </>}
      actions={<>
        {(canWork || started) && checklistAvailable && (
          <Link href={`/app/pm/jobs/${cycle.id}/work`} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700" data-help="pm-open-checklist">
            <ClipboardCheck size={15} /> {started ? 'Open checklist' : 'Start checklist'}
          </Link>
        )}
        {canWork && started && <Button variant="outline" size="sm" loading={busy === 'report'} onClick={report} data-help="pm-generate-report"><FileText size={14} /> Generate report</Button>}
      </>}>

      <div className="flex flex-wrap items-center gap-2" data-help="pm-status-line">
        <StatusChip status={cycle.status} className="px-3 py-1 text-xs" />
        <BlockerChips cycle={cycle} />
        <OverdueChip cycle={cycle} today={today} />
        {cycle.jobNumber
          ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Job {cycle.jobNumber}</span>
          : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">No job number yet</span>}
        {cycle.techId && <span className="text-xs text-slate-500">Technician: <span className="font-medium text-slate-700">{techName(cycle.techId)}</span></span>}
        {closed && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Lock size={11} /> {cycle.status === 'completed' ? `Closed ${fmtDate(cycle.closedAt, today)}` : 'Cancelled'}</span>}
      </div>
      <ErrorNote>{error}</ErrorNote>
      {note && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{note}</p>}
      {cycle.completionOverrideReason && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><span className="font-semibold">Closed by an administrator override:</span> {cycle.completionOverrideReason}</p>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Job number" id="job" actions={edit && dirty(JOB) && <Button size="sm" loading={busy === 'job'} onClick={() => save('job', JOB)}>Save</Button>}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3" data-help="pm-job-number">
              <Field label="Kalos job number" hint={cycle.jobNumber ? 'Changing it keeps the old number in the history below.' : 'Leave it empty until the real number arrives. The PM stays Awaiting Job Number.'}>
                <input value={draft.jobNumber} onChange={(e) => set('jobNumber', e.target.value)} disabled={!edit} className={fieldCls} placeholder="Not received yet" />
              </Field>
              <Field label="ServiceChannel work order">
                <input value={draft.scWorkOrder} onChange={(e) => set('scWorkOrder', e.target.value)} disabled={!edit} className={fieldCls} />
              </Field>
              <Field label="Date job received">
                <input type="date" value={draft.jobReceivedDate} onChange={(e) => set('jobReceivedDate', e.target.value)} disabled={!edit} className={fieldCls} />
              </Field>
              <Field label="Priority">
                <select value={draft.priority} onChange={(e) => set('priority', e.target.value)} disabled={!edit} className={fieldCls}>
                  <option value="">Not set</option>
                  {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.key} ({p.window})</option>)}
                </select>
              </Field>
              <div>
                <Field label="Due date">
                  <input type="date" value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} disabled={!edit} className={fieldCls} />
                </Field>
                {edit && suggestedDue && suggestedDue !== draft.dueDate ? (
                  <button type="button" onClick={() => set('dueDate', suggestedDue)} className="mt-1 text-left text-[11px] font-medium text-indigo-600 hover:underline">
                    Use {fmtDate(suggestedDue, today)} ({draft.priority}: {days} business {days === 1 ? 'day' : 'days'} from received)
                  </button>
                ) : <span className="mt-1 block text-[11px] text-slate-400">Typed in, or suggested from the priority and the received date.</span>}
              </div>
            </div>
            {jobNumbers.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Job number history</p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {jobNumbers.map((j) => (
                    <li key={j.id} className="flex flex-wrap items-center gap-x-2">
                      <span className={cn('font-semibold tabular-nums', j.isCurrent ? 'text-slate-900' : 'text-slate-400 line-through')}>{j.jobNumber}</span>
                      {j.isCurrent && <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800">current</span>}
                      <span>entered {fmtDate(j.enteredAt, today)} by {(j.enteredBy && names[j.enteredBy]) || 'someone'}</span>
                      {j.receivedDate && <span>received {fmtDate(j.receivedDate, today)}</span>}
                      {j.supersededAt && <span>replaced {fmtDate(j.supersededAt, today)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Schedule and visit" id="schedule" actions={edit && dirty(SCHEDULE) && <Button size="sm" loading={busy === 'schedule'} onClick={() => save('schedule', SCHEDULE)}>Save</Button>}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Technician">
                <select value={draft.techId} onChange={(e) => set('techId', e.target.value)} disabled={!edit} className={fieldCls}>
                  <option value="">Unassigned</option>{activeTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Second technician">
                <select value={draft.helperTechId} onChange={(e) => set('helperTechId', e.target.value)} disabled={!edit} className={fieldCls}>
                  <option value="">None</option>{activeTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Scheduled date"><input type="date" value={draft.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} disabled={!edit} className={fieldCls} /></Field>
              <Field label="Service provider"><input value={draft.serviceProvider} onChange={(e) => set('serviceProvider', e.target.value)} disabled={!edit} className={fieldCls} /></Field>
              <Field label="Work started"><input type="date" value={draft.actualStart} onChange={(e) => set('actualStart', e.target.value)} disabled={!edit} className={fieldCls} /></Field>
              <Field label="Date of completion"><input type="date" value={draft.actualEnd} onChange={(e) => set('actualEnd', e.target.value)} disabled={!edit} className={fieldCls} /></Field>
              <Field label="Time in"><input value={draft.timeIn} onChange={(e) => set('timeIn', e.target.value)} disabled={!edit} className={fieldCls} placeholder="7:30 AM" /></Field>
              <Field label="Time out"><input value={draft.timeOut} onChange={(e) => set('timeOut', e.target.value)} disabled={!edit} className={fieldCls} placeholder="3:15 PM" /></Field>
              <Field label="FM spot checked completion">
                <select value={draft.fmSpotChecked} onChange={(e) => set('fmSpotChecked', e.target.value)} disabled={!edit} className={fieldCls}>
                  <option value="">Not recorded</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Checklist" id="checklist"
            actions={started && template && <span className="text-[11px] text-slate-400">{template.name}, Q{template.quarter}{template.revisionLabel ? `, ${template.revisionLabel}` : ''}, version {template.version}</span>}>
            {!started ? (
              <p className="px-4 py-5 text-sm text-slate-500">
                {checklistAvailable
                  ? 'No checklist is attached yet. Open it to attach the live one for this quarter.'
                  : `No Q${cycle.quarter} checklist has been published yet, so this PM cannot be worked. An administrator sets one up under Settings, Checklist Templates.`}
              </p>
            ) : (
              <div className="space-y-4 p-4" data-help="pm-progress">
                <CycleBars cycle={cycle} />
                {cycle.checklistDone === 0 && <p className="text-xs font-medium text-slate-600">Blank. The checklist was attached when this PM was created and nothing has been inspected yet.</p>}
                <p className="text-xs text-slate-500">
                  Both numbers are counted from the checklist itself and cannot be typed in. Checks marked Not Applicable, and checks that do not apply to this store, are left out of the total.
                  {counts.uninspected > 0 && <> <span className="font-medium text-slate-700">{counts.uninspected} not inspected yet.</span></>}
                  {counts.incomplete > 0 && <> <span className="font-medium text-amber-700">{counts.incomplete} inspected but missing a photo, reading, or note.</span></>}
                  {counts.fails > 0 && <> <span className="font-medium text-rose-700">{counts.fails} failed{counts.failsUnlinked ? `, ${counts.failsUnlinked} not written up yet` : ''}.</span></>}
                </p>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {sections.filter((s) => s.total > 0).map((s) => (
                    <ProgressBar key={s.key} value={s.pct} small label={`${s.label} ${s.done}/${s.total}${s.fails ? `, ${s.fails} failed` : ''}`} />
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">{checkPhotos} {checkPhotos === 1 ? 'photo' : 'photos'} attached to checks.</p>
              </div>
            )}
          </Card>

          <Card title={`Filters and parts${openMaterials ? ` (${openMaterials} open)` : ''}`} id="materials">
            <MaterialsPanel pmId={cycle.id} materials={materials} onChange={(next) => { setMaterials(next); router.refresh() }} canWork={canWork && !closed} canCoordinate={canCoordinate}
              userId={userId} equipment={equipment} names={names} today={today} />
          </Card>

          <Card title={`Deficiencies${openDefs ? ` (${openDefs} open)` : ''}`} id="deficiencies">
            <DeficienciesPanel pmId={cycle.id} storeId={store.id} deficiencies={deficiencies} onChange={(next) => { setDeficiencies(next); router.refresh() }} attachments={attachments}
              canWork={canWork} canCoordinate={canCoordinate} equipment={equipment} names={names} today={today} />
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
              A deficiency stays on the store after this PM closes. It only holds the PM up if it is marked as doing so.
            </p>
          </Card>

          <Card title="Notes" id="notes" actions={canCoordinate && dirty(NOTES) && <Button size="sm" loading={busy === 'notes'} onClick={() => save('notes', NOTES)}>Save</Button>}>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <Field label="Technician notes" hint={canCoordinate ? 'Printed on the PM report.' : 'Written from the checklist screen. Printed on the PM report.'}>
                <textarea value={draft.techNotes} onChange={(e) => set('techNotes', e.target.value)} disabled={!canCoordinate} rows={5} className={fieldCls} />
              </Field>
              <Field label="Coordinator notes" hint="Office only. Not printed on the report.">
                <textarea value={draft.coordinatorNotes} onChange={(e) => set('coordinatorNotes', e.target.value)} disabled={!canCoordinate} rows={5} className={fieldCls} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Status and closeout" id="status" actions={edit && dirty(STATUS) && <Button size="sm" loading={busy === 'status'} onClick={() => save('status', STATUS)}>Save</Button>}>
            <div className="space-y-3 p-4" data-help="pm-closeout">
              <Field label="Status" hint="Field Work Complete and Completed are not in this list. They are set with the buttons below, once their checks pass.">
                <select value={MANUAL_STATUSES.includes(draft.status) ? draft.status : ''} onChange={(e) => { if (e.target.value) set('status', e.target.value as PmStatus) }} disabled={!edit} className={fieldCls}>
                  {!MANUAL_STATUSES.includes(draft.status) && <option value="">{STATUS_LABEL[draft.status]}</option>}
                  {MANUAL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </Field>
              <Field label="Status note"><input value={draft.statusNote} onChange={(e) => set('statusNote', e.target.value)} disabled={!edit} className={fieldCls} placeholder="Why it is on hold, what it is waiting for" /></Field>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={draft.returnVisitNeeded} onChange={(e) => set('returnVisitNeeded', e.target.checked)} disabled={!edit} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                <span><span className="font-medium">Return visit needed</span><span className="block text-[11px] text-slate-400">A blocker, shown beside the status. It does not change the status.</span></span>
              </label>
              {draft.returnVisitNeeded && <input value={draft.returnVisitNote} onChange={(e) => set('returnVisitNote', e.target.value)} disabled={!edit} className={fieldCls} placeholder="What the return visit is for" aria-label="Return visit note" />}
              <Field label="Documentation submitted on" hint="PhaseForge records the date. It does not submit anything to ServiceChannel: that is still done there by hand.">
                <input type="date" value={draft.submittedOn} onChange={(e) => set('submittedOn', e.target.value)} disabled={!edit} className={fieldCls} />
              </Field>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                {!afterField && cycle.status !== 'cancelled' && (
                  <div>
                    <Button variant="outline" size="sm" className="w-full" disabled={!canWork || !started} loading={busy === 'field'} onClick={fieldDone}><CheckCircle2 size={14} /> Mark field work complete</Button>
                    {fieldGaps.length > 0 && <p className="mt-1 text-[11px] text-slate-400">Not ready yet: {fieldGaps.length} {fieldGaps.length === 1 ? 'thing' : 'things'} outstanding.</p>}
                  </div>
                )}
                {!closed && canCoordinate && (
                  <div>
                    <Button size="sm" className="w-full" loading={busy === 'complete'} onClick={() => complete(false)}><CheckCircle2 size={14} /> Mark completed</Button>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {closeGaps.length === 0 ? `Meets all ${rulesOn} completion rules.` : `${closeGaps.length} ${closeGaps.length === 1 ? 'thing stands' : 'things stand'} between this PM and Completed.`}
                    </p>
                  </div>
                )}
                {shownGaps && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">Still outstanding</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                      {shownGaps.map((g) => <li key={g}>{g}</li>)}
                    </ul>
                    {isAdmin && gaps && !closed && (
                      <div className="mt-2 space-y-1.5 border-t border-amber-200 pt-2">
                        <p className="text-[11px] text-amber-900">As an administrator you can close it anyway. The reason goes on the record.</p>
                        <input value={override} onChange={(e) => setOverride(e.target.value)} className={fieldCls} placeholder="Reason for closing it as it stands" aria-label="Override reason" />
                        <Button variant="danger" size="sm" disabled={override.trim().length < 5} loading={busy === 'complete'} onClick={() => complete(true)}>Close with override</Button>
                      </div>
                    )}
                  </div>
                )}
                {canCoordinate && (afterField || cycle.status === 'cancelled') && (
                  reopening ? (
                    <div className="space-y-1.5">
                      <input value={reopenWhy} onChange={(e) => setReopenWhy(e.target.value)} className={fieldCls} placeholder="Why it is being reopened" aria-label="Reason for reopening" />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={!reopenWhy.trim()} loading={busy === 'reopen'} onClick={reopen}>Reopen</Button>
                        <Button variant="ghost" size="sm" onClick={() => setReopening(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setReopening(true)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600"><RotateCcw size={12} /> Reopen this PM</button>
                  )
                )}
              </div>
            </div>
          </Card>

          <Card title="PM reports" id="reports">
            {reports.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-400">No report generated yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText size={16} className="shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">Version {r.version}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {fmtDate(r.generatedAt, today)} by {(r.generatedBy && names[r.generatedBy]) || 'someone'}
                        {r.checklistTotal ? `, checklist ${r.checklistDone}/${r.checklistTotal}` : ''}{r.sizeBytes ? `, ${size(r.sizeBytes)}` : ''}
                      </p>
                    </div>
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-indigo-300 hover:text-indigo-600" aria-label={`Open report version ${r.version}`}><Download size={14} /></a>}
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">Every version is kept. Generating again adds a new one and leaves the old ones as they were.</p>
          </Card>

          <Card title="Other files" id="files"
            actions={canWork && <>
              <input ref={fileRef} type="file" multiple hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => upload(e.target.files)} />
              <Button variant="outline" size="sm" loading={busy === 'upload'} onClick={() => fileRef.current?.click()}><Upload size={14} /> Add</Button>
            </>}>
            {looseFiles.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-5 text-sm text-slate-400"><Paperclip size={15} className="shrink-0" /> Compressor forms, proposals, and anything else that belongs with this PM.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {looseFiles.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                    <Paperclip size={14} className="shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-indigo-700 hover:underline">{a.name}</a> : <span className="block truncate text-sm text-slate-700">{a.name}</span>}
                      <p className="text-[11px] text-slate-400">{fmtDate(a.createdAt, today)} by {(a.uploadedBy && names[a.uploadedBy]) || 'someone'}{a.sizeBytes ? `, ${size(a.sizeBytes)}` : ''}</p>
                    </div>
                    {(canCoordinate || a.uploadedBy === userId) && <button type="button" onClick={() => removeFile(a)} className="p-1 text-slate-300 hover:text-rose-600" aria-label={`Remove ${a.name}`}><Trash2 size={14} /></button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="History" id="history">
            <div className="max-h-[480px] overflow-y-auto"><ActivityList items={activity} names={names} /></div>
          </Card>

          {isAdmin && (
            <Card title="Administrator corrections" id="admin">
              <div className="space-y-3 p-4 text-xs text-slate-500">
                <p>For a PM that was entered against the wrong quarter. Its checklist stays on the version it was started with.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={moveQuarter} onChange={(e) => setMoveQuarter(Number(e.target.value))} className={cn(fieldCls, 'w-auto')} aria-label="Quarter">{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Q{n}</option>)}</select>
                  <input type="number" value={moveYear} onChange={(e) => setMoveYear(Number(e.target.value))} className={cn(fieldCls, 'w-24')} aria-label="Year" />
                  <Button variant="outline" size="sm" disabled={moveQuarter === cycle.quarter && moveYear === cycle.year} loading={busy === 'move'} onClick={move}>Move</Button>
                </div>
                <button type="button" onClick={remove} className="inline-flex items-center gap-1 font-medium text-rose-600 hover:underline"><Trash2 size={12} /> Delete this PM record</button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PmPage>
  )
}
