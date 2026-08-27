'use client'

// The Related section shown on supported records: FK-derived relations the
// schema already knows (passed in by the host page), explicit item_links,
// the "+ Link item" picker, and a small impact chain for causal links.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, Link2, Plus, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  createLink, deleteLink, listLinks, searchLinkTargets,
  LINK_TYPE_LABELS,
  type LinkCandidate, type LinkEntityType, type LinkType, type LinkedItem,
} from '@/app/app/linkActions'

export interface DerivedRelation {
  label: string
  sublabel?: string | null
  href: string
  /** e.g. "Belongs to" */
  relation: string
}

interface RelatedItemsProps {
  entityType: LinkEntityType
  entityId: string
  entityLabel: string
  /** Relations the schema already knows (a CO's project, etc.). */
  derived?: DerivedRelation[]
  projectId?: string | null
  canEdit: boolean
  className?: string
}

const ENTITY_LABELS: Record<LinkEntityType, string> = {
  project: 'Project',
  phase: 'Schedule activity',
  change_order: 'Change order',
  punch_item: 'Punch item',
  plan_sheet: 'Plan sheet',
  quote_pricing: 'Quote',
}

/** Causal link types worth drawing as a chain rather than a flat list. */
const CHAIN_TYPES = new Set<LinkType>(['caused_by', 'schedule_impact', 'cost_impact', 'impacts', 'generated_from'])

export function RelatedItems({
  entityType, entityId, entityLabel, derived = [], projectId = null, canEdit, className,
}: RelatedItemsProps) {
  const [links, setLinks] = useState<LinkedItem[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    void listLinks(entityType, entityId).then(setLinks).catch(() => setLinks([]))
  }, [entityType, entityId])

  useEffect(() => { reload() }, [reload])

  const chain = useMemo(() => (links ?? []).filter((l) => CHAIN_TYPES.has(l.linkType)), [links])
  const flat = useMemo(() => (links ?? []).filter((l) => !CHAIN_TYPES.has(l.linkType)), [links])

  const remove = async (l: LinkedItem) => {
    setLinks((cur) => (cur ?? []).filter((x) => x.linkId !== l.linkId))
    const res = await deleteLink(l.linkId, projectId)
    if (!res.ok) { setError(res.error ?? 'Could not remove that link.'); reload() }
  }

  /** "CO 14 caused_by Punch #3": phrase from the perspective of this record. */
  const phrase = (l: LinkedItem): string => {
    const label = LINK_TYPE_LABELS[l.linkType]
    if (l.direction === 'out') return label
    // Inbound: invert the readable direction for asymmetric types.
    switch (l.linkType) {
      case 'caused_by': return 'Caused'
      case 'impacts': return 'Impacted by'
      case 'generated_from': return 'Generated'
      case 'blocked_by': return 'Blocks'
      case 'resolves': return 'Resolved by'
      case 'follow_up_to': return 'Followed up by'
      default: return label
    }
  }

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Link2 size={14} className="text-slate-400" /> Related
        </h3>
        {canEdit && (
          <button onClick={() => setPickerOpen(true)} data-help="related-link"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
            <Plus size={12} /> Link item
          </button>
        )}
      </div>

      {/* FK-derived relations: PhaseForge already knows these, no one links
          them by hand. */}
      {derived.length > 0 && (
        <div className="mt-3 space-y-1">
          {derived.map((d) => (
            <Link key={d.href + d.label} href={d.href}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
              <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{d.relation}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{d.label}</span>
              {d.sublabel && <span className="shrink-0 text-[10px] text-slate-400">{d.sublabel}</span>}
            </Link>
          ))}
        </div>
      )}

      {/* Impact chain: causal links drawn as a flow. */}
      {chain.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Impact chain</p>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-800">{entityLabel}</p>
            {chain.map((l) => (
              <div key={l.linkId} className="group">
                <div className="flex items-center gap-1 py-0.5 text-[10px] font-medium text-slate-400">
                  <ArrowDown size={10} /> {phrase(l).toLowerCase()}
                </div>
                <div className="flex items-center gap-2">
                  <Link href={l.href} className="min-w-0 flex-1 truncate text-xs font-semibold text-indigo-700 hover:underline">
                    {l.label}{l.sublabel ? <span className="ml-1.5 font-normal text-slate-400">{l.sublabel}</span> : null}
                  </Link>
                  {canEdit && (
                    <button onClick={() => void remove(l)} aria-label="Remove link"
                      className="p-0.5 text-slate-300 opacity-0 transition group-hover:opacity-100 pointer-coarse:opacity-100 hover:text-rose-500">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plain relations. */}
      <div className="mt-3 space-y-1">
        {links === null && <p className="text-xs text-slate-400">Loading…</p>}
        {links !== null && flat.length === 0 && chain.length === 0 && derived.length === 0 && (
          <p className="text-xs text-slate-400">
            Nothing linked yet.{canEdit ? ' Connect the change order, punch item, drawing, or activity this belongs with.' : ''}
          </p>
        )}
        {flat.map((l) => (
          <div key={l.linkId} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
            <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{phrase(l)}</span>
            <Link href={l.href} className="min-w-0 flex-1 truncate font-medium text-slate-700 hover:text-indigo-700 hover:underline">
              {l.label}
            </Link>
            {l.sublabel && <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">{l.sublabel}</span>}
            {canEdit && (
              <button onClick={() => void remove(l)} aria-label="Remove link"
                className="p-0.5 text-slate-300 opacity-0 transition group-hover:opacity-100 pointer-coarse:opacity-100 hover:text-rose-500">
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}

      {pickerOpen && (
        <LinkPicker
          sourceType={entityType}
          sourceId={entityId}
          sourceLabel={entityLabel}
          projectId={projectId}
          onLinked={() => { setPickerOpen(false); reload() }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function LinkPicker({ sourceType, sourceId, sourceLabel, projectId, onLinked, onClose }: {
  sourceType: LinkEntityType
  sourceId: string
  sourceLabel: string
  projectId: string | null
  onLinked: () => void
  onClose: () => void
}) {
  const [typeFilter, setTypeFilter] = useState<LinkEntityType | ''>('')
  const [linkType, setLinkType] = useState<LinkType>('related_to')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LinkCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced search as the user types.
  useEffect(() => {
    const q = query.trim()
    const t = setTimeout(() => {
      if (q.length < 2) { setResults([]); return }
      setSearching(true)
      void searchLinkTargets(q, typeFilter || undefined)
        .then((r) => setResults(r.filter((c) => !(c.entityType === sourceType && c.entityId === sourceId))))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query, typeFilter, sourceType, sourceId])

  const pick = async (c: LinkCandidate) => {
    setBusy(true); setError(null)
    const res = await createLink({
      sourceType, sourceId, targetType: c.entityType, targetId: c.entityId,
      linkType, projectId, sourceLabel, targetLabel: c.label,
    })
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Could not link that.'); return }
    onLinked()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Link an item</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as LinkEntityType | '')}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
              <option value="">Any type</option>
              {Object.entries(ENTITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)}
              title="What this relationship means"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
              {Object.entries(LINK_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, number, customer…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-xs outline-none focus:border-indigo-400" />
          </div>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-4 pb-4">
          {searching && <p className="py-2 text-center text-xs text-slate-400">Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-2 text-center text-xs text-slate-400">Nothing matches.</p>
          )}
          {results.map((c) => (
            <button key={`${c.entityType}:${c.entityId}`} onClick={() => void pick(c)} disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left text-xs transition hover:border-indigo-200 hover:bg-indigo-50/40 disabled:opacity-50">
              <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {ENTITY_LABELS[c.entityType]}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.label}</span>
              {c.sublabel && <span className="shrink-0 truncate text-[10px] text-slate-400" style={{ maxWidth: 120 }}>{c.sublabel}</span>}
            </button>
          ))}
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
