'use client'

import { useEffect } from 'react'
import { X, ImageOff } from 'lucide-react'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { format, formatDate } from '@/lib/dates'
import { PRIORITY_LABELS } from '@/lib/constants'
import { PUNCH_STATUS_LABELS } from '@/lib/punch'
import { PunchItem, Project, ProjectPriority } from '@/types/app'

export type PunchPrintScope = 'all' | 'open' | 'completed'

interface PunchPrintModalProps {
  project: Project
  items: PunchItem[]
  memberMap: Record<string, string>
  scope: PunchPrintScope
  onClose: () => void
}

const SCOPE_TITLES: Record<PunchPrintScope, string> = {
  all: 'Punch List Report',
  open: 'Open Punch Items',
  completed: 'Completed Punch Items',
}

export function PunchPrintModal({ project, items, memberMap, scope, onClose }: PunchPrintModalProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 250)
    const handleAfterPrint = () => onClose()
    window.addEventListener('afterprint', handleAfterPrint)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [onClose])

  const filtered = items
    .filter((i) => {
      if (scope === 'open') return i.status !== 'completed'
      if (scope === 'completed') return i.status === 'completed'
      return true
    })
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))

  const memberName = (id: string | null) => (id ? memberMap[id] ?? '—' : '—')

  return (
    <div className="punch-print-root fixed inset-0 z-[9999] overflow-auto bg-slate-200/80 backdrop-blur-sm">
      <div className="punch-print-sheet min-h-screen bg-white text-black shadow-2xl">
        <div className="print:hidden sticky top-4 z-50 flex justify-end px-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <X size={20} />
          </button>
        </div>

        {/* Report header */}
        <div className="flex items-start justify-between gap-6 border-b border-slate-200 px-8 pb-6 pt-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{SCOPE_TITLES[scope]}</h1>
            <p className="mt-2 text-base font-semibold text-slate-700">{project.name}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {[project.customer_name, project.job_location].filter(Boolean).join(' • ') || '—'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {filtered.length} item{filtered.length !== 1 ? 's' : ''} • Generated {format(new Date(), 'MMM d, yyyy')}
            </p>
          </div>
          <GantticLogo variant="lockup" width={170} alt="PhaseForge logo" />
        </div>

        {filtered.length === 0 ? (
          <div className="px-8 py-12 text-center text-slate-500">No punch items match this selection.</div>
        ) : (
          <div className="px-8 py-6 space-y-5">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="punch-print-card break-inside-avoid rounded-lg border border-slate-300"
              >
                {/* Card header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="text-sm font-bold text-slate-900">
                    Punch Item #{item.number ?? '—'}
                    {item.title ? <span className="font-semibold text-slate-700"> — {item.title}</span> : null}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {PUNCH_STATUS_LABELS[item.status]}
                  </span>
                </div>

                {/* Meta row */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 pt-3 text-xs text-slate-600 sm:grid-cols-4">
                  <Meta label="Priority" value={PRIORITY_LABELS[item.priority as ProjectPriority]} />
                  <Meta label="Assigned" value={memberName(item.assigned_to)} />
                  <Meta label="Due" value={item.due_date ? formatDate(item.due_date, 'MMM d, yyyy') : '—'} />
                  <Meta label="Location" value={item.location || '—'} />
                  {item.category && <Meta label="Category" value={item.category} />}
                </div>

                {/* Issue + completion columns */}
                <div className="grid grid-cols-1 gap-4 px-4 py-3 sm:grid-cols-2">
                  <PhotoBlock
                    heading="Issue"
                    url={item.issue_photo_url}
                    text={item.issue_description}
                  />
                  <PhotoBlock
                    heading="Completion"
                    url={item.completion_photo_url}
                    text={item.completion_description}
                    footer={
                      item.completed_at
                        ? `Completed by ${memberName(item.completed_by)} on ${formatDate(item.completed_at, 'MMM d, yyyy')}`
                        : 'Not completed'
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @page { size: portrait; margin: 0.4in; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body {
            margin: 0 !important; padding: 0 !important; height: auto !important;
            overflow: visible !important; background: white !important;
          }
          body * { visibility: hidden !important; }
          .punch-print-root, .punch-print-root * { visibility: visible !important; }
          .punch-print-root {
            position: absolute !important; inset: 0 !important; overflow: visible !important;
            height: auto !important; width: 100% !important; background: white !important;
          }
          .punch-print-sheet { min-height: 0 !important; box-shadow: none !important; }
          .punch-print-card { break-inside: avoid !important; page-break-inside: avoid !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-slate-500">{label}: </span>
      <span className="text-slate-800">{value}</span>
    </div>
  )
}

function PhotoBlock({
  heading,
  url,
  text,
  footer,
}: {
  heading: string
  url?: string | null
  text?: string | null
  footer?: string
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{heading}</p>
      <div className="mb-2 h-44 w-full overflow-hidden rounded border border-slate-200 bg-slate-50">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${heading} photo`} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageOff size={22} />
          </div>
        )}
      </div>
      <p className="text-sm text-slate-800">{text || <span className="text-slate-400">—</span>}</p>
      {footer && <p className="mt-1 text-xs text-slate-500">{footer}</p>}
    </div>
  )
}
