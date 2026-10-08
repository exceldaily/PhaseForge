'use client'

// One check on the technician's phone. Pass, Fail, or N/A in a single tap,
// with the note, the recorded value, and the photos right there, so the whole
// checklist is done without leaving the page.

import { useState } from 'react'
import { AlertTriangle, Camera, Check, ChevronDown, FileWarning, Loader2, Ruler, StickyNote, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MISSING_LABEL, type ItemEval } from '@/lib/pm/progress'
import type { QueueEntry } from '@/lib/pm/syncQueue'
import { RESULT_LABEL, type CheckResult, type PmAttachment, type PmDeficiency, type PmResponse, type TemplateItem } from '@/lib/pm/types'
import type { PendingPhoto } from './usePmSync'

const NA_REASONS = ['Not at this store', 'Equipment not present', 'Could not get access', 'Covered under another job']

const EDGE: Record<string, string> = {
  todo: 'border-l-slate-300', incomplete: 'border-l-amber-400', pass: 'border-l-emerald-500', fail: 'border-l-rose-500', na: 'border-l-slate-300', excluded: 'border-l-slate-200',
}

export function ChecklistItem({
  item, ev, response, photos, pending, deficiencies, entry, canWork, names, focused,
  onResult, onNote, onMeasure, onAddPhotos, onRemovePhoto, onDropPending, onDeficiency, onGoToReadings, onResolve, onRetry,
}: {
  item: TemplateItem
  ev: ItemEval
  response: PmResponse | undefined
  photos: PmAttachment[]
  pending: PendingPhoto[]
  deficiencies: PmDeficiency[]
  /** This check's place in the autosave queue, if it is waiting, failed, or in conflict. */
  entry: QueueEntry | undefined
  canWork: boolean
  names: Record<string, string>
  focused: boolean
  onResult: (result: CheckResult | null, naReason?: string) => void
  onNote: (text: string) => void
  onMeasure: (text: string) => void
  onAddPhotos: (files: File[]) => void
  onRemovePhoto: (a: PmAttachment) => void
  onDropPending: (id: string) => void
  onDeficiency: () => void
  onGoToReadings: (table: string) => void
  onResolve: (keep: 'mine' | 'theirs') => void
  onRetry: () => void
}) {
  const [more, setMore] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [naOpen, setNaOpen] = useState(false)
  const [naText, setNaText] = useState('')
  const result = response?.result ?? null
  const showNote = noteOpen || !!response?.note || item.requiresNote || result === 'fail'
  const long = item.description.length > 150

  if (ev.state === 'excluded') {
    return (
      <div id={`pm-item-${item.id}`} className="flex items-start gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-600">{item.code}</span>
        <span className="min-w-0 flex-1"><span className="font-medium text-slate-600">Left off this store&apos;s checklist.</span> {ev.excludedWhy}</span>
      </div>
    )
  }

  const pick = (r: CheckResult) => {
    if (!canWork) return
    if (r === 'na') { if (result === 'na') onResult(null); else setNaOpen(true); return }
    setNaOpen(false)
    onResult(result === r ? null : r)
  }
  const button = (r: CheckResult, on: string, off: string) => (
    <button type="button" disabled={!canWork} onClick={() => pick(r)} aria-pressed={result === r}
      className={cn('flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 text-base font-bold transition-colors disabled:opacity-60 sm:h-10 sm:text-sm', result === r ? on : off)}>
      {result === r && r === 'pass' && <Check size={16} />}{result === r && r === 'fail' && <X size={16} />}{RESULT_LABEL[r]}
    </button>
  )

  return (
    <div id={`pm-item-${item.id}`} className={cn('scroll-mt-28 rounded-xl border border-l-4 border-slate-200 bg-white p-3', EDGE[ev.state], focused && 'ring-2 ring-indigo-400')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-bold text-white">{item.code}</span>
        {item.applicability && item.applicability !== 'ALL' && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">{item.applicability}</span>}
        {item.requiresPhoto && <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"><Camera size={10} /> Photo required</span>}
        {item.readingRefs.length > 0 && <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"><Ruler size={10} /> Readings</span>}
        {item.fopmOnFail && <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"><FileWarning size={10} /> FOPM if it fails</span>}
        {entry?.state === 'pending' || entry?.state === 'sending' ? <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-400"><Loader2 size={10} className="animate-spin" /> Saving</span> : null}
      </div>

      <p className={cn('mt-1.5 text-sm leading-snug text-slate-800', long && !more && 'line-clamp-3')}>{item.description}</p>
      {long && <button type="button" onClick={() => setMore((m) => !m)} className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium text-indigo-600">{more ? 'Show less' : 'Show all'} <ChevronDown size={12} className={cn(more && 'rotate-180')} /></button>}
      {item.hint && <p className="mt-1 text-xs text-slate-500">{item.hint}</p>}

      <div className="mt-2.5 flex gap-2">
        {button('pass', 'border-emerald-600 bg-emerald-600 text-white', 'border-slate-200 bg-white text-slate-600')}
        {button('fail', 'border-rose-600 bg-rose-600 text-white', 'border-slate-200 bg-white text-slate-600')}
        {button('na', 'border-slate-600 bg-slate-600 text-white', 'border-slate-200 bg-white text-slate-600')}
      </div>

      {naOpen && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-xs font-semibold text-slate-700">Why does this not apply?</p>
          <div className="flex flex-wrap gap-1.5">
            {NA_REASONS.map((r) => <button key={r} type="button" onClick={() => { setNaOpen(false); onResult('na', r) }} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 sm:py-1 sm:text-xs">{r}</button>)}
          </div>
          <div className="flex gap-2">
            <input value={naText} onChange={(e) => setNaText(e.target.value)} placeholder="Or type the reason" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-base outline-none focus:border-indigo-400 sm:py-1.5 sm:text-sm" />
            <button type="button" disabled={!naText.trim()} onClick={() => { setNaOpen(false); onResult('na', naText.trim()); setNaText('') }} className="rounded-lg bg-slate-700 px-3 text-sm font-semibold text-white disabled:opacity-40">Use</button>
            <button type="button" onClick={() => setNaOpen(false)} className="px-1 text-sm text-slate-500">Cancel</button>
          </div>
        </div>
      )}
      {result === 'na' && response?.naReason && <p className="mt-1.5 text-xs text-slate-500">Not applicable: {response.naReason}</p>}

      {ev.missing.length > 0 && result !== null && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle size={12} /> Not counted yet: {ev.missing.map((m) => MISSING_LABEL[m].toLowerCase()).join(', ')}
        </p>
      )}

      {item.measureLabel && (
        <label className="mt-2.5 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">{item.measureLabel}{item.measureUnit ? ` (${item.measureUnit})` : ''}{item.requiresMeasure ? ', required' : ''}</span>
          <input disabled={!canWork} value={response?.measureValue ?? ''} onChange={(e) => onMeasure(e.target.value)} inputMode="decimal" autoComplete="off"
            className={cn('w-40 rounded-lg border px-2.5 py-2 text-base outline-none focus:border-indigo-400 sm:py-1.5 sm:text-sm', ev.missing.includes('measure') && result !== null ? 'border-amber-400 bg-amber-50' : 'border-slate-300')} />
        </label>
      )}

      {item.readingRefs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...new Set(item.readingRefs.map((r) => r.table))].map((t) => (
            <button key={t} type="button" onClick={() => onGoToReadings(t)}
              className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-sm font-medium sm:py-1 sm:text-xs', ev.missing.includes('reading') ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 text-slate-600')}>
              <Ruler size={12} /> {ev.missing.includes('reading') ? 'Enter the readings' : 'Open the readings'}
            </button>
          ))}
        </div>
      )}

      {/* Photos */}
      {(photos.length > 0 || pending.length > 0 || canWork) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {photos.map((a) => (
            <span key={a.id} className="relative block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                </a>
              ) : <span className="flex h-full items-center justify-center text-[9px] text-slate-400">Photo</span>}
              {canWork && <button type="button" onClick={() => onRemovePhoto(a)} aria-label="Remove photo" className="absolute right-0 top-0 rounded-bl-lg bg-black/60 p-1 text-white"><X size={11} /></button>}
            </span>
          ))}
          {pending.map((p) => (
            <span key={p.id} className="relative block h-16 w-16 overflow-hidden rounded-lg border border-amber-300 bg-slate-100" title={p.error ?? 'Waiting to upload'}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} className="h-full w-full object-cover opacity-60" />
              <span className={cn('absolute inset-x-0 bottom-0 py-0.5 text-center text-[9px] font-bold text-white', p.state === 'failed' ? 'bg-rose-600' : 'bg-amber-600')}>{p.state === 'failed' ? 'Failed' : p.state === 'uploading' ? 'Sending' : 'Waiting'}</span>
              <button type="button" onClick={() => onDropPending(p.id)} aria-label="Remove photo" className="absolute right-0 top-0 rounded-bl-lg bg-black/60 p-1 text-white"><X size={11} /></button>
            </span>
          ))}
          {canWork && (
            <label className={cn('flex h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed px-3 text-[11px] font-semibold',
              ev.missing.includes('photo') && result !== null ? 'border-amber-400 bg-amber-50 text-amber-800' : item.requiresPhoto && photos.length + pending.length === 0 ? 'border-indigo-300 text-indigo-700' : 'border-slate-300 text-slate-500')}>
              <Camera size={18} />{photos.length + pending.length ? 'Add' : 'Add photo'}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) onAddPhotos(files) }} />
            </label>
          )}
        </div>
      )}

      {/* Note */}
      {showNote ? (
        <label className="mt-2.5 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Note{item.requiresNote ? ', required' : result === 'fail' ? ': what did you find?' : ''}</span>
          <textarea rows={2} disabled={!canWork} value={response?.note ?? ''} onChange={(e) => onNote(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-base outline-none focus:border-indigo-400 sm:py-1.5 sm:text-sm" />
        </label>
      ) : canWork && (
        <button type="button" onClick={() => setNoteOpen(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600"><StickyNote size={12} /> Add a note</button>
      )}

      {/* A failed check gets written up */}
      {result === 'fail' && (
        <div className={cn('mt-2.5 rounded-lg border p-2.5', deficiencies.length ? 'border-slate-200 bg-slate-50' : 'border-rose-200 bg-rose-50')}>
          {deficiencies.length ? (
            <p className="text-xs text-slate-700"><span className="font-semibold">Written up:</span> {deficiencies.map((d) => d.description).join(' / ')}</p>
          ) : (
            <p className="text-xs font-medium text-rose-800">This failed check needs a deficiency written up.{item.fopmOnFail ? ' The sheet calls for an FOPM proposal.' : ''}</p>
          )}
          {canWork && <button type="button" onClick={onDeficiency} className="mt-2 w-full rounded-lg bg-rose-600 px-3 py-2.5 text-sm font-bold text-white sm:w-auto sm:py-1.5 sm:text-xs">{deficiencies.length ? 'Write up another' : 'Write up the deficiency'}</button>}
        </div>
      )}

      {/* Save trouble on this one check */}
      {entry?.state === 'failed' && (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-medium text-rose-800">
          This did not save: {entry.error} <button type="button" onClick={onRetry} className="rounded border border-rose-300 bg-white px-2 py-0.5 font-semibold">Try again</button>
        </p>
      )}
      {entry?.state === 'conflict' && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-semibold">{(entry.server?.inspectedBy && names[entry.server.inspectedBy]) || 'Someone else'} changed this check while you were working.</p>
          <p className="mt-0.5">Theirs: {entry.server?.result ? RESULT_LABEL[entry.server.result] : 'not inspected'}{entry.server?.note ? `, "${entry.server.note}"` : ''}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => onResolve('mine')} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white sm:py-1 sm:text-xs">Keep mine</button>
            <button type="button" onClick={() => onResolve('theirs')} className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900 sm:py-1 sm:text-xs">Use theirs</button>
          </div>
        </div>
      )}

      {response?.inspectedAt && result && (
        <p className="mt-2 text-[11px] text-slate-400" suppressHydrationWarning>
          {RESULT_LABEL[result]} by {(response.inspectedBy && names[response.inspectedBy]) || 'someone'}, {new Date(response.inspectedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}
