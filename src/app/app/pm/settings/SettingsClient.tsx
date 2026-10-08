'use client'

// Preventative Maintenance settings: who the technicians are, what has to be
// true before a PM can close, which alerts go out, and the checklist for each
// quarter.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Copy, FileCheck2, ListChecks, Pencil, Plus, Trash2, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { fmtDate, quarterMonths } from '@/lib/pm/quarters'
import {
  NOTIFY_LABEL, RULE_LABEL,
  type CompletionRules, type NotifyRules, type PmTech, type TemplateVersion,
} from '@/lib/pm/types'
import { Card, ErrorNote, Field, PmPage, fieldCls } from '@/components/pm/ui'
import { saveTech } from '../actions'
import { cloneTemplate, deleteTemplateDraft, installAldiQ2, publishTemplate, saveCompletionRules, saveNotifyRules } from '../settingsActions'

export type TemplateRow = Omit<TemplateVersion, 'dataTables'> & { items: number; pms: number }
interface Person { id: string; name: string; email: string | null }
type TechForm = { id?: string; name: string; profileId: string; phone: string; email: string; isActive: boolean }

const STATUS_TONE: Record<TemplateRow['status'], string> = {
  draft: 'bg-amber-100 text-amber-800', active: 'bg-emerald-100 text-emerald-800', retired: 'bg-slate-200 text-slate-600',
}
const STATUS_TEXT: Record<TemplateRow['status'], string> = { draft: 'Draft', active: 'Live', retired: 'Retired' }

export function SettingsClient({ rules: savedRules, notify: savedNotify, techs, people, templates, isAdmin, canCoordinate }: {
  rules: CompletionRules; notify: NotifyRules; techs: PmTech[]; people: Person[]; templates: TemplateRow[]; isAdmin: boolean; canCoordinate: boolean
}) {
  const router = useRouter()
  const [rules, setRules] = useState(savedRules)
  const [notify, setNotify] = useState(savedNotify)
  const [tech, setTech] = useState<TechForm | null>(null)
  const [cloneOf, setCloneOf] = useState<string | null>(null)
  const [cloneQuarter, setCloneQuarter] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const run = async <T extends { ok: boolean; error?: string }>(key: string, fn: () => Promise<T>): Promise<T> => {
    setBusy(key); setError(null); setNote(null)
    const res = await fn()
    setBusy(null)
    if (!res.ok) setError(res.error ?? 'That did not save.')
    else router.refresh()
    return res
  }
  const rulesDirty = (Object.keys(rules) as (keyof CompletionRules)[]).some((k) => rules[k] !== savedRules[k])
  const notifyDirty = (Object.keys(notify) as (keyof NotifyRules)[]).some((k) => notify[k] !== savedNotify[k])
  const personName = (id: string | null) => people.find((p) => p.id === id)?.name ?? null
  const taken = new Set(techs.filter((t) => t.profileId && t.id !== tech?.id).map((t) => t.profileId as string))

  const saveTechForm = async () => {
    if (!tech) return
    const res = await run('tech', () => saveTech({ id: tech.id, name: tech.name, profileId: tech.profileId || null, phone: tech.phone, email: tech.email, isActive: tech.isActive }))
    if (res.ok) setTech(null)
  }
  const install = async () => {
    const res = await run('install', () => installAldiQ2())
    if (res.ok && 'id' in res) router.push(`/app/pm/settings/templates/${res.id}`)
  }
  const clone = async () => {
    if (!cloneOf) return
    const res = await run('clone', () => cloneTemplate({ fromId: cloneOf, quarter: cloneQuarter }))
    if (res.ok && 'id' in res) router.push(`/app/pm/settings/templates/${res.id}`)
  }
  const publish = async (t: TemplateRow) => {
    const live = templates.find((x) => x.quarter === t.quarter && x.status === 'active')
    if (!confirm(`Make version ${t.version} the live Q${t.quarter} checklist?${live ? ` Version ${live.version} is retired. PMs already started on it stay on it.` : ''} Once published it cannot be edited, only revised.`)) return
    const res = await run(`publish:${t.id}`, () => publishTemplate({ id: t.id }))
    if (res.ok) setNote(`Version ${t.version} is now the live Q${t.quarter} checklist. PMs started from here on use it.`)
  }
  const removeDraft = async (t: TemplateRow) => {
    if (!confirm(`Delete the Q${t.quarter} draft (version ${t.version})?`)) return
    await run(`delete:${t.id}`, () => deleteTemplateDraft({ id: t.id }))
  }

  return (
    <PmPage title="PM Settings" subtitle="Technicians, completion rules, alerts, and the checklist for each quarter.">
      <ErrorNote>{error}</ErrorNote>
      {note && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{note}</p>}
      {!isAdmin && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Only an administrator can change the completion rules, alerts, and checklists. {canCoordinate ? 'You can manage technicians.' : 'This page is view only for you.'}</p>}

      {/* Checklist templates */}
      <Card title={<span className="inline-flex items-center gap-2"><ListChecks size={15} /> Checklist templates</span>} id="templates"
        actions={isAdmin && !templates.some((t) => t.quarter === 2) && <Button size="sm" loading={busy === 'install'} onClick={install}><Plus size={14} /> Load the ALDI Q2 checklist</Button>}>
        <div className="space-y-3 p-4" data-help="pm-templates">
          <p className="text-xs text-slate-500">
            Each quarter has its own checklist, and each checklist has versions. A PM is tied to the version that was live when its checklist was started, so changing a checklist never rewrites history.
            The ALDI sheet differs by quarter: a Q2 checklist is not assumed to be right for Q1, Q3, or Q4.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((q) => {
              const list = templates.filter((t) => t.quarter === q)
              const live = list.find((t) => t.status === 'active')
              return (
                <div key={q} className={cn('rounded-xl border p-3', live ? 'border-slate-200' : 'border-dashed border-amber-300 bg-amber-50/40')}>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-base font-bold text-slate-900">Q{q}</h3>
                    <span className="text-[11px] text-slate-400">{quarterMonths(q)}</span>
                  </div>
                  {!live && <p className="mt-1 text-xs font-medium text-amber-800">No live checklist. Q{q} PMs cannot be worked until one is published.</p>}
                  <ul className="mt-2 space-y-2">
                    {list.map((t) => (
                      <li key={t.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_TONE[t.status])}>{STATUS_TEXT[t.status]}</span>
                          <span className="text-xs font-semibold text-slate-800">Version {t.version}</span>
                          {t.revisionLabel && <span className="text-[11px] text-slate-500">{t.revisionLabel}</span>}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-600" title={t.name}>{t.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {t.items} {t.items === 1 ? 'check' : 'checks'}, used by {t.pms} {t.pms === 1 ? 'PM' : 'PMs'}
                          {t.publishedAt ? `, published ${fmtDate(t.publishedAt)}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                          <Link href={`/app/pm/settings/templates/${t.id}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                            {t.status === 'draft' && isAdmin ? <><Pencil size={11} /> Edit</> : 'View'}
                          </Link>
                          {isAdmin && t.status === 'draft' && <button type="button" disabled={!!busy} onClick={() => publish(t)} className="inline-flex items-center gap-1 text-emerald-700 hover:underline"><FileCheck2 size={11} /> Publish</button>}
                          {isAdmin && <button type="button" onClick={() => { setCloneOf(t.id); setCloneQuarter(t.quarter) }} className="inline-flex items-center gap-1 text-slate-600 hover:underline"><Copy size={11} /> Copy</button>}
                          {isAdmin && t.status === 'draft' && <button type="button" disabled={!!busy} onClick={() => removeDraft(t)} className="inline-flex items-center gap-1 text-rose-600 hover:underline"><Trash2 size={11} /> Delete</button>}
                        </div>
                        {cloneOf === t.id && (
                          <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
                            <p className="text-[11px] text-slate-600">Copy into a new draft for:</p>
                            <div className="flex items-center gap-2">
                              <select value={cloneQuarter} onChange={(e) => setCloneQuarter(Number(e.target.value))} className={cn(fieldCls, 'w-auto')} aria-label="Quarter">
                                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Q{n}{n === t.quarter ? ' (a revision)' : ''}</option>)}
                              </select>
                              <Button size="sm" loading={busy === 'clone'} onClick={clone}>Copy</Button>
                              <Button size="sm" variant="ghost" onClick={() => setCloneOf(null)}>Cancel</Button>
                            </div>
                            {cloneQuarter !== t.quarter && <p className="text-[11px] text-amber-800">The copy is only a starting point. Check every line against the Q{cloneQuarter} sheet before you publish it.</p>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Completion rules */}
        <Card title="Completion rules" id="rules" actions={isAdmin && rulesDirty && <Button size="sm" loading={busy === 'rules'} onClick={() => run('rules', () => saveCompletionRules({ rules }))}>Save</Button>}>
          <div className="p-4" data-help="pm-rules">
            <p className="mb-3 text-xs text-slate-500">What has to be true before a PM can be marked Completed. Ticking every box on the checklist is never enough by itself. An administrator can still close a PM that falls short, with a written reason.</p>
            <ul className="space-y-2.5">
              {(Object.keys(RULE_LABEL) as (keyof CompletionRules)[]).map((k) => (
                <li key={k}>
                  <label className="flex items-start gap-2.5">
                    <input type="checkbox" checked={rules[k]} disabled={!isAdmin} onChange={(e) => setRules((r) => ({ ...r, [k]: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                    <span><span className="text-sm font-medium text-slate-800">{RULE_LABEL[k].label}</span><span className="block text-[11px] text-slate-400">{RULE_LABEL[k].hint}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">Open deficiencies do not hold a PM up unless the deficiency itself is marked as doing so. A repair that follows a PM is its own job.</p>
          </div>
        </Card>

        {/* Alerts */}
        <Card title={<span className="inline-flex items-center gap-2"><Bell size={15} /> Alerts</span>} id="alerts" actions={isAdmin && notifyDirty && <Button size="sm" loading={busy === 'notify'} onClick={() => run('notify', () => saveNotifyRules({ notify }))}>Save</Button>}>
          <div className="p-4">
            <p className="mb-3 text-xs text-slate-500">These arrive in the PhaseForge notification bell.</p>
            <ul className="space-y-2.5">
              {(Object.keys(NOTIFY_LABEL) as (keyof NotifyRules)[]).map((k) => (
                <li key={k}>
                  <label className="flex items-start gap-2.5">
                    <input type="checkbox" checked={notify[k]} disabled={!isAdmin} onChange={(e) => setNotify((n) => ({ ...n, [k]: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                    <span><span className="text-sm font-medium text-slate-800">{NOTIFY_LABEL[k].label}</span><span className="block text-[11px] text-slate-400">{NOTIFY_LABEL[k].who}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-500">
              <p className="font-semibold text-slate-600">Not built yet</p>
              <p className="mt-0.5">Email and Google Chat delivery, and sending anything to ServiceChannel. PhaseForge does not submit PMs to ServiceChannel: the submission date on a PM is a record of what was done there by hand.</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Technicians */}
      <Card title={<span className="inline-flex items-center gap-2"><UserCog size={15} /> Technicians</span>} id="techs"
        actions={canCoordinate && <Button size="sm" variant="outline" onClick={() => setTech({ name: '', profileId: '', phone: '', email: '', isActive: true })}><Plus size={14} /> Add technician</Button>}>
        <div data-help="pm-techs">
          <p className="border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            A technician can be assigned PMs without a PhaseForge login. Linking one to a login is what lets that person open My PMs and fill in the checklists assigned to them, and nothing else.
          </p>
          {tech && (
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Name"><input value={tech.name} onChange={(e) => setTech({ ...tech, name: e.target.value })} className={fieldCls} /></Field>
              <Field label="PhaseForge login">
                <select value={tech.profileId} onChange={(e) => setTech({ ...tech, profileId: e.target.value })} className={fieldCls}>
                  <option value="">No login</option>
                  {people.filter((p) => !taken.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.email ? ` (${p.email})` : ''}</option>)}
                </select>
              </Field>
              <Field label="Phone"><input value={tech.phone} onChange={(e) => setTech({ ...tech, phone: e.target.value })} className={fieldCls} /></Field>
              <Field label="Email"><input value={tech.email} onChange={(e) => setTech({ ...tech, email: e.target.value })} className={fieldCls} /></Field>
              <div className="flex items-end gap-2">
                <label className="mb-2 flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={tech.isActive} onChange={(e) => setTech({ ...tech, isActive: e.target.checked })} className="h-4 w-4 rounded border-slate-300" /> Active</label>
                <Button size="sm" loading={busy === 'tech'} disabled={!tech.name.trim()} onClick={saveTechForm}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setTech(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {techs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No technicians yet. Add the people who run PMs so stores and PMs can be assigned to them.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {techs.map((t) => (
                <li key={t.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5', !t.isActive && 'opacity-60')}>
                  <span className="min-w-[140px] text-sm font-semibold text-slate-900">{t.name}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', t.profileId ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
                    {t.profileId ? `Login: ${personName(t.profileId) ?? 'linked'}` : 'No login'}
                  </span>
                  {!t.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">Inactive</span>}
                  <span className="text-xs text-slate-500">{[t.phone, t.email].filter(Boolean).join(' | ')}</span>
                  {canCoordinate && (
                    <button type="button" onClick={() => setTech({ id: t.id, name: t.name, profileId: t.profileId ?? '', phone: t.phone ?? '', email: t.email ?? '', isActive: t.isActive })}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><Pencil size={11} /> Edit</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </PmPage>
  )
}
