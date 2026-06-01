'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Plus, Save, User, Wrench, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePhaseConfig } from '@/hooks/usePhaseConfig'
import { Button } from '@/components/ui/Button'
import { DEFAULT_PHASE_COLORS, PHASE_STATUS_LABELS } from '@/lib/constants'
import { formatDate } from '@/lib/dates'
import {
  getPhasePercentComplete,
  getPhasePercentForStatusChange,
  sanitizePhasePercentComplete,
  shouldRetryLegacyPhaseWrite,
} from '@/lib/phaseProgress'
import { touchProjectAudit } from '@/lib/projectAudit'
import { cn } from '@/lib/utils'
import { Phase, PhaseStatus, Profile, Project } from '@/types/app'
import { PhaseComments } from '@/components/phases/PhaseComments'

interface GanttEditPanelProps {
  phase: Phase
  project: Project
  companyId: string
  members: Profile[]
  currentUserId: string
  onClose: () => void
  onUpdate: (phase: Phase) => void
  canEdit: boolean
}

function normalizeOption(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function findMatchingOption(options: string[], value: string) {
  const normalized = normalizeOption(value).toLowerCase()
  return options.find((option) => normalizeOption(option).toLowerCase() === normalized)
}

export function GanttEditPanel({
  phase,
  project,
  companyId,
  members,
  currentUserId,
  onClose,
  onUpdate,
  canEdit,
}: GanttEditPanelProps) {
  const { trades, addTrade } = usePhaseConfig(companyId)
  const [form, setForm] = useState({
    name: phase.name,
    start_date: phase.start_date,
    end_date: phase.end_date,
    assigned_to: phase.assigned_to || '',
    status: phase.status,
    percent_complete: String(getPhasePercentComplete(phase)),
    is_milestone: Boolean(phase.is_milestone),
    is_critical_path: Boolean(phase.is_critical_path),
    color: phase.color || DEFAULT_PHASE_COLORS[0],
    notes: phase.notes || '',
  })
  const [assignMode, setAssignMode] = useState<'person' | 'trade'>(phase.assigned_trade ? 'trade' : 'person')
  const [tradeInput, setTradeInput] = useState(phase.assigned_trade || '')
  const [showTradeDropdown, setShowTradeDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const tradeRef = useRef<HTMLDivElement>(null)
  const filteredTrades = trades.filter((trade) =>
    trade.toLowerCase().includes(tradeInput.toLowerCase())
  )
  const hasMatchingTrade = Boolean(findMatchingOption(trades, tradeInput))
  const assignee = members.find((member) => member.id === phase.assigned_to)
  const assignedTrade = phase.assigned_trade?.trim()

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (tradeRef.current && !tradeRef.current.contains(event.target as Node)) {
        setShowTradeDropdown(false)
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const set = (key: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const setChecked = (key: 'is_milestone' | 'is_critical_path') => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => setForm((current) => ({ ...current, [key]: event.target.checked }))

  const handleStatusChange = (nextStatus: Phase['status']) => {
    setForm((current) => ({
      ...current,
      status: nextStatus,
      percent_complete: String(getPhasePercentForStatusChange(nextStatus, Number(current.percent_complete))),
    }))
  }

  const selectTrade = (trade: string) => {
    setTradeInput(trade)
    setShowTradeDropdown(false)
  }

  const useOneOffTrade = () => {
    const trimmed = normalizeOption(tradeInput)
    if (!trimmed) return

    selectTrade(trimmed)
  }

  const createAndSelectTrade = () => {
    const trimmed = normalizeOption(tradeInput)
    if (!trimmed) return

    const savedTrade = addTrade(trimmed)
    selectTrade(savedTrade || trimmed)
  }

  const handleSave = async () => {
    if (form.start_date > form.end_date) {
      alert('Start date must be on or before the end date.')
      return
    }

    setSaving(true)

    const supabase = createClient()
    const payload = {
      ...form,
      assigned_to: assignMode === 'person' ? (form.assigned_to || null) : null,
      assigned_trade: assignMode === 'trade' ? (normalizeOption(tradeInput) || null) : null,
      percent_complete: sanitizePhasePercentComplete(form.status as Phase['status'], form.percent_complete),
      is_milestone: form.is_milestone,
      is_critical_path: form.is_critical_path,
      updated_at: new Date().toISOString(),
    }
    const legacyPayload = {
      name: form.name,
      start_date: form.start_date,
      end_date: form.end_date,
      assigned_to: assignMode === 'person' ? (form.assigned_to || null) : null,
      assigned_trade: assignMode === 'trade' ? (normalizeOption(tradeInput) || null) : null,
      status: form.status,
      color: form.color,
      notes: form.notes,
      updated_at: payload.updated_at,
    }

    let { data, error } = await supabase
      .from('phases')
      .update(payload)
      .eq('id', phase.id)
      .select()
      .single()

    if (error && shouldRetryLegacyPhaseWrite(error.message)) {
      const fallback = await supabase
        .from('phases')
        .update(legacyPayload)
        .eq('id', phase.id)
        .select()
        .single()
      data = fallback.data
      error = fallback.error
    }

    if (data) {
      await touchProjectAudit(supabase, project.id, currentUserId)
      onUpdate(data as Phase)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex w-80 flex-shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: form.color }} />
          <span className="max-w-[160px] truncate text-sm font-semibold text-slate-900">{form.name}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div>
          <p className="text-xs text-slate-400">Project</p>
          <p className="text-sm font-medium text-slate-700">{project.name}</p>
        </div>
        <Link href={`/app/projects/${project.id}`} className="text-slate-400 transition-colors hover:text-indigo-600">
          <ExternalLink size={14} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {canEdit ? (
          <>
            <Field label="Phase name">
              <input
                value={form.name}
                onChange={set('name')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <input
                  type="date"
                  value={form.start_date}
                  onChange={set('start_date')}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={form.end_date}
                  onChange={set('end_date')}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
            </div>

            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) => handleStatusChange(event.target.value as Phase['status'])}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Object.entries(PHASE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Assigned to">
              <div className="space-y-2">
                <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setAssignMode('person')}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                      assignMode === 'person' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    )}
                  >
                    <User size={11} /> Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignMode('trade')}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                      assignMode === 'trade' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    )}
                  >
                    <Wrench size={11} /> Trade / Role
                  </button>
                </div>

                {assignMode === 'person' ? (
                  <select
                    value={form.assigned_to}
                    onChange={set('assigned_to')}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div ref={tradeRef} className="relative">
                    <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-transparent focus-within:ring-2 focus-within:ring-indigo-500">
                      <Wrench size={13} className="ml-3 flex-shrink-0 text-slate-400" />
                      <input
                        value={tradeInput}
                        onChange={(event) => {
                          setTradeInput(event.target.value)
                          setShowTradeDropdown(true)
                        }}
                        onFocus={() => setShowTradeDropdown(true)}
                        placeholder="Select trade / role or type a custom one..."
                        className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
                      />
                      {tradeInput && (
                        <button
                          type="button"
                          onClick={() => setTradeInput('')}
                          className="px-2 text-slate-400 hover:text-slate-600"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    {showTradeDropdown && (
                      <div className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                        {filteredTrades.map((trade) => (
                          <button
                            key={trade}
                            type="button"
                            onClick={() => selectTrade(trade)}
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            {trade}
                          </button>
                        ))}

                        {tradeInput.trim() && !hasMatchingTrade && (
                          <div className="border-t border-slate-100 p-2">
                            <button
                              type="button"
                              onClick={useOneOffTrade}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                            >
                              <Wrench size={14} /> Use &ldquo;{normalizeOption(tradeInput)}&rdquo; once
                            </button>
                            <button
                              type="button"
                              onClick={createAndSelectTrade}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50"
                            >
                              <Plus size={14} /> Save &ldquo;{normalizeOption(tradeInput)}&rdquo; to trade / role options
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Field>

            <Field label="Color">
              <div className="flex flex-wrap gap-2">
                {DEFAULT_PHASE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, color }))}
                    className="h-6 w-6 rounded-full border-2 transition-all"
                    style={{ backgroundColor: color, borderColor: form.color === color ? '#0f172a' : 'transparent' }}
                  />
                ))}
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <Field label="Progress %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={form.percent_complete}
                  onChange={set('percent_complete')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>

              <Field label="Timeline flags">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.is_milestone}
                      onChange={setChecked('is_milestone')}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Milestone</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.is_critical_path}
                      onChange={setChecked('is_critical_path')}
                      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Critical path</span>
                  </label>
                </div>
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Add notes..."
              />
            </Field>
          </>
        ) : (
          <div className="space-y-3">
            <InfoRow label="Dates" value={`${formatDate(phase.start_date)} to ${formatDate(phase.end_date)}`} />
            <InfoRow label="Status" value={PHASE_STATUS_LABELS[phase.status as PhaseStatus]} />
            <InfoRow label="Progress" value={`${getPhasePercentComplete(phase)}%`} />
            <InfoRow label="Assigned to" value={assignee?.full_name || assignedTrade || 'Unassigned'} />
            <InfoRow label="Milestone" value={phase.is_milestone ? 'Yes' : 'No'} />
            <InfoRow label="Critical path" value={phase.is_critical_path ? 'Yes' : 'No'} />
            {phase.notes && <InfoRow label="Notes" value={phase.notes} />}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="border-t border-slate-100 px-5 py-4">
          <Button className="w-full" onClick={handleSave} loading={saving}>
            {saved ? 'Saved' : <><Save size={14} /> Save changes</>}
          </Button>
        </div>
      )}

      <PhaseComments phaseId={phase.id} currentUserId={currentUserId} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</label>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  )
}
