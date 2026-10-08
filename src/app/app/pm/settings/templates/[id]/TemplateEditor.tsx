'use client'

// One version of a quarter's checklist. A draft can be edited line by line;
// a published version is shown exactly as technicians see it and cannot be
// changed, only revised into a new draft.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, Camera, Copy, FileCheck2, Gauge, Lock, Pencil, Plus, StickyNote, Table2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { quarterMonths } from '@/lib/pm/quarters'
import { SECTIONS } from '@/lib/pm/template'
import type { TemplateItem, TemplateVersion } from '@/lib/pm/types'
import { Card, ErrorNote, Field, PmPage, fieldCls } from '@/components/pm/ui'
import {
  cloneTemplate, deleteTemplateItem, moveTemplateItem, publishTemplate, saveTemplateItem, updateTemplate, type TemplateItemInput,
} from '../../../settingsActions'

const APPLIES = [
  { value: 'ALL', label: 'Every store' }, { value: 'HFC', label: 'HFC only' }, { value: 'CO2', label: 'CO2 only' }, { value: 'R-290', label: 'R-290 only' },
  { value: 'HFC/CO2', label: 'HFC and CO2' }, { value: 'HFC/R-290', label: 'HFC and R-290' }, { value: 'CO2/R-290', label: 'CO2 and R-290' },
]

type Form = Omit<TemplateItemInput, 'versionId'>
const blank = (sectionKey: string): Form => ({
  sectionKey, code: '', applicability: 'ALL', description: '', requiresPhoto: false, requiresNote: false, measureLabel: '', measureUnit: '',
  requiresMeasure: false, readingTables: [], fopmOnFail: false, hint: '',
})
const fromItem = (i: TemplateItem): Form => ({
  id: i.id, sectionKey: i.sectionKey, code: i.code, applicability: i.applicability || 'ALL', description: i.description, requiresPhoto: i.requiresPhoto,
  requiresNote: i.requiresNote, measureLabel: i.measureLabel ?? '', measureUnit: i.measureUnit ?? '', requiresMeasure: i.requiresMeasure,
  readingTables: [...new Set(i.readingRefs.map((r) => r.table))], fopmOnFail: i.fopmOnFail, hint: i.hint ?? '',
})

export function TemplateEditor({ template, items, pmCount, isAdmin }: { template: TemplateVersion; items: TemplateItem[]; pmCount: number; isAdmin: boolean }) {
  const router = useRouter()
  const draft = template.status === 'draft' && isAdmin
  const [meta, setMeta] = useState({ name: template.name, revisionLabel: template.revisionLabel ?? '', notes: template.notes ?? '' })
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const metaDirty = meta.name !== template.name || meta.revisionLabel !== (template.revisionLabel ?? '') || meta.notes !== (template.notes ?? '')
  const tables = template.dataTables ?? []
  const tableTitle = (key: string) => tables.find((t) => t.key === key)?.title ?? key

  const run = async <T extends { ok: boolean; error?: string }>(key: string, fn: () => Promise<T>): Promise<T> => {
    setBusy(key); setError(null)
    const res = await fn()
    setBusy(null)
    if (!res.ok) setError(res.error ?? 'That did not save.')
    else router.refresh()
    return res
  }
  const saveItem = async () => {
    if (!form) return
    const res = await run('item', () => saveTemplateItem({ ...form, versionId: template.id }))
    if (res.ok) setForm(null)
  }
  const removeItem = async (i: TemplateItem) => {
    if (!confirm(`Remove ${i.code} from this draft?`)) return
    await run(`del:${i.id}`, () => deleteTemplateItem({ id: i.id, versionId: template.id }))
  }
  const publish = async () => {
    if (!confirm(`Make this the live Q${template.quarter} checklist? Whatever is live for Q${template.quarter} now is retired, and PMs already started on it stay on it. Once published, this version cannot be edited.`)) return
    const res = await run('publish', () => publishTemplate({ id: template.id }))
    if (res.ok) router.push('/app/pm/settings#templates')
  }
  const revise = async () => {
    const res = await run('clone', () => cloneTemplate({ fromId: template.id, quarter: template.quarter }))
    if (res.ok && 'id' in res) router.push(`/app/pm/settings/templates/${res.id}`)
  }

  const editor = form && (
    <div className="space-y-3 border-y border-indigo-200 bg-indigo-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="PM ID" hint="As printed on the sheet."><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={fieldCls} placeholder="COND1" /></Field>
        <Field label="Section">
          <select value={form.sectionKey} onChange={(e) => setForm({ ...form, sectionKey: e.target.value })} className={fieldCls}>{SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </Field>
        <Field label="Applies to" className="sm:col-span-2">
          <select value={form.applicability} onChange={(e) => setForm({ ...form, applicability: e.target.value })} className={fieldCls}>{APPLIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
        </Field>
      </div>
      <Field label="Wording"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={fieldCls} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Value to record on the check" hint="Receiver level, battery level. Leave empty for none.">
          <input value={form.measureLabel ?? ''} onChange={(e) => setForm({ ...form, measureLabel: e.target.value })} className={fieldCls} placeholder="Receiver level" />
        </Field>
        <Field label="Unit"><input value={form.measureUnit ?? ''} onChange={(e) => setForm({ ...form, measureUnit: e.target.value })} className={fieldCls} placeholder="%" disabled={!form.measureLabel} /></Field>
        <Field label="Tip shown to the technician"><input value={form.hint ?? ''} onChange={(e) => setForm({ ...form, hint: e.target.value })} className={fieldCls} /></Field>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
        {([['requiresPhoto', 'Photo required'], ['requiresNote', 'Note required'], ['requiresMeasure', 'The value is required'], ['fopmOnFail', 'A failure needs an FOPM proposal']] as const).map(([k, label]) => (
          <label key={k} className={cn('flex items-center gap-1.5', k === 'requiresMeasure' && !form.measureLabel && 'opacity-40')}>
            <input type="checkbox" checked={form[k]} disabled={k === 'requiresMeasure' && !form.measureLabel} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} className="h-4 w-4 rounded border-slate-300" /> {label}
          </label>
        ))}
      </div>
      {tables.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Readings this check needs, from the data entry tables</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-700">
            {tables.map((t) => (
              <label key={t.key} className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.readingTables.includes(t.key)} className="h-3.5 w-3.5 rounded border-slate-300"
                  onChange={(e) => setForm({ ...form, readingTables: e.target.checked ? [...form.readingTables, t.key] : form.readingTables.filter((k) => k !== t.key) })} /> {t.title}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" loading={busy === 'item'} onClick={saveItem}>{form.id ? 'Save check' : 'Add check'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
      </div>
    </div>
  )

  return (
    <PmPage
      title={`Q${template.quarter} checklist, version ${template.version}`}
      subtitle={<>
        <Link href="/app/pm/settings#templates" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"><ArrowLeft size={12} /> PM Settings</Link>
        <span className="mx-2 text-slate-300">|</span>{quarterMonths(template.quarter)}
        <span className="mx-2 text-slate-300">|</span>{items.length} {items.length === 1 ? 'check' : 'checks'}, used by {pmCount} {pmCount === 1 ? 'PM' : 'PMs'}
      </>}
      actions={<>
        {draft && <Button size="sm" loading={busy === 'publish'} onClick={publish}><FileCheck2 size={14} /> Publish</Button>}
        {isAdmin && template.status !== 'draft' && <Button size="sm" variant="outline" loading={busy === 'clone'} onClick={revise}><Copy size={14} /> Start a revision</Button>}
      </>}>
      <ErrorNote>{error}</ErrorNote>
      {template.status !== 'draft' ? (
        <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Lock size={13} className="mt-0.5 shrink-0" />
          <span>This version is {template.status === 'active' ? `the live Q${template.quarter} checklist` : 'retired'} and cannot be edited, so the PMs worked on it keep showing what was actually inspected. To change it, start a revision: that makes a draft copy you can edit and publish.</span>
        </p>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Draft. Nothing uses it until it is published. Check every line against the ALDI Q{template.quarter} sheet, including which checks need photos and readings.
        </p>
      )}

      <Card title="About this version" actions={isAdmin && metaDirty && <Button size="sm" loading={busy === 'meta'} onClick={() => run('meta', () => updateTemplate({ id: template.id, ...meta }))}>Save</Button>}>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Name"><input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} disabled={!isAdmin} className={fieldCls} /></Field>
          <Field label="Revision label" hint="As printed on the ALDI sheet, for example Rev: 01_01_25."><input value={meta.revisionLabel} onChange={(e) => setMeta({ ...meta, revisionLabel: e.target.value })} disabled={!isAdmin} className={fieldCls} /></Field>
          <Field label="Notes"><input value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} disabled={!isAdmin} className={fieldCls} /></Field>
        </div>
      </Card>

      {SECTIONS.map((sec) => {
        const list = items.filter((i) => i.sectionKey === sec.key)
        if (!list.length && !draft) return null
        return (
          <Card key={sec.key} title={<>{sec.label} <span className="ml-1 text-xs font-normal text-slate-400">{list.length}</span></>}
            actions={draft && <button type="button" onClick={() => setForm(blank(sec.key))} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><Plus size={12} /> Add a check</button>}>
            {form && !form.id && form.sectionKey === sec.key && editor}
            {list.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">No checks in this section.</p>}
            <ul className="divide-y divide-slate-100">
              {list.map((i, n) => (
                <li key={i.id}>
                  {form?.id === i.id ? editor : (
                    <div className="flex gap-3 px-4 py-2.5">
                      <div className="w-20 shrink-0">
                        <p className="text-sm font-bold text-slate-900">{i.code}</p>
                        {i.applicability && i.applicability !== 'ALL' && <p className="text-[10px] font-medium text-slate-400">{i.applicability}</p>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">{i.description}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-medium">
                          {i.requiresPhoto && <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-sky-800"><Camera size={10} /> Photo</span>}
                          {i.requiresNote && <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700"><StickyNote size={10} /> Note</span>}
                          {i.measureLabel && <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-violet-800"><Gauge size={10} /> {i.measureLabel}{i.measureUnit ? ` (${i.measureUnit})` : ''}{i.requiresMeasure ? ', required' : ''}</span>}
                          {[...new Set(i.readingRefs.map((r) => r.table))].map((k) => <span key={k} className="inline-flex items-center gap-1 rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-800"><Table2 size={10} /> {tableTitle(k)}</span>)}
                          {i.fopmOnFail && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">FOPM proposal on failure</span>}
                        </div>
                        {i.hint && <p className="mt-1 text-[11px] italic text-slate-400">{i.hint}</p>}
                      </div>
                      {draft && (
                        <div className="flex shrink-0 items-start gap-0.5 text-slate-400">
                          <button type="button" disabled={n === 0 || !!busy} onClick={() => run(`mv:${i.id}`, () => moveTemplateItem({ id: i.id, versionId: template.id, direction: 'up' }))} className="p-1 hover:text-indigo-600 disabled:opacity-30" aria-label={`Move ${i.code} up`}><ArrowUp size={14} /></button>
                          <button type="button" disabled={n === list.length - 1 || !!busy} onClick={() => run(`mv:${i.id}`, () => moveTemplateItem({ id: i.id, versionId: template.id, direction: 'down' }))} className="p-1 hover:text-indigo-600 disabled:opacity-30" aria-label={`Move ${i.code} down`}><ArrowDown size={14} /></button>
                          <button type="button" onClick={() => setForm(fromItem(i))} className="p-1 hover:text-indigo-600" aria-label={`Edit ${i.code}`}><Pencil size={14} /></button>
                          <button type="button" disabled={!!busy} onClick={() => removeItem(i)} className="p-1 hover:text-rose-600" aria-label={`Remove ${i.code}`}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )
      })}

      <Card title="Data entry tables">
        <div className="p-4">
          <p className="mb-2 text-xs text-slate-500">The readings pages of the sheet. They come with the checklist and are copied along when it is revised. Rows for circuits and compressors follow each store&apos;s own equipment list when it has one.</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <li key={t.key} className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{t.columns.map((c) => c.label).join(', ')}</p>
                <p className="text-[11px] text-slate-400">{t.rowSource === 'fixed' ? `${t.rows.length} fixed ${t.rows.length === 1 ? 'row' : 'rows'}` : `One row per ${t.rowSource === 'circuits' ? 'circuit' : t.rowSource === 'compressors' ? 'rack compressor' : 'HVAC compressor'}`}</p>
              </li>
            ))}
            {tables.length === 0 && <li className="text-sm text-slate-400">This checklist has no data entry tables.</li>}
          </ul>
        </div>
      </Card>
    </PmPage>
  )
}
