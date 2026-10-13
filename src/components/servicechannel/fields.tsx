'use client'

// Small form primitives shared by the record pages, so every form in the
// module looks the same and the page files stay about the data.

import type { ReactNode } from 'react'
import type { Person } from '@/lib/servicechannel/server'
import { cn } from '@/lib/utils'

export const input = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50'
export const lbl = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500'
export const box = 'rounded-xl border border-slate-200 bg-white p-4'
export const btnPrimary = 'rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50'
export const btn = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50'
export const btnSmall = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50'

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return <label className={cn('block', className)}><span className={lbl}>{label}</span>{children}{hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}</label>
}
export function Text({ label, value, onChange, placeholder, className, hint, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; hint?: string; type?: string }) {
  return <Field label={label} className={className} hint={hint}><input type={type} className={input} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></Field>
}
export function Area({ label, value, onChange, placeholder, rows = 3, className, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; className?: string; hint?: string }) {
  return <Field label={label} className={className} hint={hint}><textarea className={input} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></Field>
}
export function Select({ label, value, onChange, options, className, blank, hint }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; className?: string; blank?: string; hint?: string }) {
  return <Field label={label} className={className} hint={hint}><select className={input} value={value} onChange={(e) => onChange(e.target.value)}>{blank !== undefined && <option value="">{blank}</option>}{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
}
/** Owner picker: PhaseForge users first, then directory people without a login. Value is the owner key. */
export function PersonSelect({ label, value, onChange, people, className, blank = 'Nobody yet', hint }: { label: string; value: string; onChange: (key: string, name: string | null) => void; people: Person[]; className?: string; blank?: string; hint?: string }) {
  const withLogin = people.filter((p) => p.hasLogin), without = people.filter((p) => !p.hasLogin)
  const name = (k: string) => people.find((p) => p.id === k)?.name.replace(' (no login)', '') ?? null
  return (
    <Field label={label} className={className} hint={hint}>
      <select className={input} value={value} onChange={(e) => onChange(e.target.value, name(e.target.value))}>
        <option value="">{blank}</option>
        {withLogin.length > 0 && <optgroup label="PhaseForge users">{withLogin.map((p) => <option key={p.id} value={p.id}>{p.name}{p.department ? ` · ${p.department}` : ''}</option>)}</optgroup>}
        {without.length > 0 && <optgroup label="Directory (no login; acknowledgment is recorded for them)">{without.map((p) => <option key={p.id} value={p.id}>{p.name.replace(' (no login)', '')}{p.department ? ` · ${p.department}` : ''}</option>)}</optgroup>}
      </select>
    </Field>
  )
}
export function DeptInput({ label = 'Department', value, onChange, departments, className }: { label?: string; value: string; onChange: (v: string) => void; departments: string[]; className?: string }) {
  const id = `dept-${label.replace(/\W/g, '')}`
  return <Field label={label} className={className}><input className={input} list={id} value={value} onChange={(e) => onChange(e.target.value)} /><datalist id={id}>{departments.map((d) => <option key={d} value={d} />)}</datalist></Field>
}
export function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null
  return <div className={cn('rounded-lg border p-3 text-sm', m.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>{m.text}</div>
}
export const Chip = ({ children, tone = 'bg-slate-100 text-slate-700' }: { children: ReactNode; tone?: string }) => <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>{children}</span>
export const STATUS_TONE: Record<string, string> = {
  open: 'bg-amber-50 text-amber-800', contacted: 'bg-sky-50 text-sky-700', in_progress: 'bg-indigo-50 text-indigo-700', pending_verification: 'bg-violet-50 text-violet-700', closed: 'bg-emerald-50 text-emerald-700',
  planned: 'bg-slate-100 text-slate-700', active: 'bg-indigo-50 text-indigo-700', on_hold: 'bg-amber-50 text-amber-800', completed: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-slate-100 text-slate-500',
  investigating: 'bg-indigo-50 text-indigo-700', verified: 'bg-emerald-50 text-emerald-700',
}
