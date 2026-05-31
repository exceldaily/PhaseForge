'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, Plus, User, Wrench, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePhaseConfig } from '@/hooks/usePhaseConfig'
import { DEFAULT_PHASE_COLORS } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { touchProjectAudit } from '@/lib/projectAudit'
import { Phase, Profile } from '@/types/app'

interface PhaseFormProps {
  projectId: string
  companyId: string
  members: Profile[]
  currentUserId: string
  phase?: Phase
  onSave: (phase: Phase) => void
  onCancel: () => void
  sortOrder: number
}

function normalizeOption(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function findMatchingOption(options: string[], value: string) {
  const normalized = normalizeOption(value).toLowerCase()
  return options.find((option) => normalizeOption(option).toLowerCase() === normalized)
}

function getInitialTypeState(phase: Phase | undefined, phaseTypes: string[]) {
  if (!phase) {
    return {
      selectedType: '',
      typeInput: '',
      typeDetail: '',
    }
  }

  const matchedType = phaseTypes.find((type) => phase.name.startsWith(type))

  if (!matchedType) {
    return {
      selectedType: '',
      typeInput: phase.name,
      typeDetail: '',
    }
  }

  return {
    selectedType: matchedType,
    typeInput: matchedType,
    typeDetail: phase.name.slice(matchedType.length).trim(),
  }
}

export function PhaseForm({ projectId, companyId, members, currentUserId, phase, onSave, onCancel, sortOrder }: PhaseFormProps) {
  const { phaseTypes, trades, addPhaseType, addTrade } = usePhaseConfig(companyId)
  const initialTypeState = getInitialTypeState(phase, phaseTypes)

  const [loading, setLoading] = useState(false)

  const [typeInput, setTypeInput] = useState(initialTypeState.typeInput)
  const [selectedType, setSelectedType] = useState(initialTypeState.selectedType)
  const [typeDetail, setTypeDetail] = useState(initialTypeState.typeDetail)
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const typeRef = useRef<HTMLDivElement>(null)

  const [assignMode, setAssignMode] = useState<'person' | 'trade'>(phase?.assigned_trade ? 'trade' : 'person')
  const [assignedTo, setAssignedTo] = useState(phase?.assigned_to || '')
  const [tradeInput, setTradeInput] = useState(phase?.assigned_trade || '')
  const [showTradeDropdown, setShowTradeDropdown] = useState(false)
  const tradeRef = useRef<HTMLDivElement>(null)

  const [startDate, setStartDate] = useState(phase?.start_date || '')
  const [endDate, setEndDate] = useState(phase?.end_date || '')
  const [status, setStatus] = useState(phase?.status || 'not_started')
  const [color, setColor] = useState(phase?.color || DEFAULT_PHASE_COLORS[sortOrder % DEFAULT_PHASE_COLORS.length])
  const [notes, setNotes] = useState(phase?.notes || '')

  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(event.target as Node)) {
        setShowTypeDropdown(false)
      }

      if (tradeRef.current && !tradeRef.current.contains(event.target as Node)) {
        setShowTradeDropdown(false)
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredTypes = phaseTypes.filter((type) =>
    type.toLowerCase().includes(typeInput.toLowerCase())
  )

  const filteredTrades = trades.filter((trade) =>
    trade.toLowerCase().includes(tradeInput.toLowerCase())
  )

  const hasMatchingType = Boolean(findMatchingOption(phaseTypes, typeInput))
  const hasMatchingTrade = Boolean(findMatchingOption(trades, tradeInput))

  const selectType = (type: string) => {
    setSelectedType(type)
    setTypeInput(type)
    setShowTypeDropdown(false)
  }

  const useOneOffType = () => {
    const trimmed = normalizeOption(typeInput)
    if (!trimmed) return

    setSelectedType('')
    setTypeInput(trimmed)
    setShowTypeDropdown(false)
  }

  const createAndSelectType = () => {
    const trimmed = normalizeOption(typeInput)
    if (!trimmed) return

    const savedType = addPhaseType(trimmed)
    selectType(savedType || trimmed)
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

  const phaseName = typeDetail.trim()
    ? `${selectedType || typeInput} ${typeDetail.trim()}`
    : (selectedType || typeInput)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!phaseName.trim()) return

    setLoading(true)
    const supabase = createClient()

    const payload = {
      project_id: projectId,
      name: phaseName.trim(),
      start_date: startDate,
      end_date: endDate,
      assigned_to: assignMode === 'person' ? (assignedTo || null) : null,
      assigned_trade: assignMode === 'trade' ? (normalizeOption(tradeInput) || null) : null,
      status,
      color,
      notes: notes || null,
      sort_order: sortOrder,
    }

    if (phase) {
      const { data } = await supabase
        .from('phases')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', phase.id)
        .select()
        .single()

      if (data) {
        await touchProjectAudit(supabase, projectId, currentUserId)
        onSave(data as Phase)
      }
    } else {
      const { data } = await supabase
        .from('phases')
        .insert(payload)
        .select()
        .single()

      if (data) {
        await touchProjectAudit(supabase, projectId, currentUserId)
        onSave(data as Phase)
      }
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex gap-2">
        <div ref={typeRef} className="relative w-52 flex-shrink-0">
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-transparent focus-within:ring-2 focus-within:ring-indigo-500">
            <input
              value={typeInput}
              onChange={(event) => {
                setTypeInput(event.target.value)
                setSelectedType('')
                setShowTypeDropdown(true)
              }}
              onFocus={() => setShowTypeDropdown(true)}
              placeholder="Phase type..."
              required
              className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShowTypeDropdown((current) => !current)}
              className="px-2 text-slate-400"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {showTypeDropdown && (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-60 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
              {filteredTypes.length > 0 && (
                <div className="py-1">
                  {filteredTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => selectType(type)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {type}
                      {type === selectedType && <span className="text-xs text-indigo-600">Selected</span>}
                    </button>
                  ))}
                </div>
              )}

              {typeInput.trim() && !hasMatchingType && (
                <div className="border-t border-slate-100 p-2">
                  <button
                    type="button"
                    onClick={useOneOffType}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    <ChevronDown size={14} /> Use &ldquo;{normalizeOption(typeInput)}&rdquo; once
                  </button>
                  <button
                    type="button"
                    onClick={createAndSelectType}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50"
                  >
                    <Plus size={14} /> Save &ldquo;{normalizeOption(typeInput)}&rdquo; to phase types
                  </button>
                </div>
              )}

              {filteredTypes.length === 0 && !typeInput.trim() && (
                <p className="px-3 py-4 text-center text-xs text-slate-400">Type to search or create</p>
              )}
            </div>
          )}
        </div>

        <input
          value={typeDetail}
          onChange={(event) => setTypeDetail(event.target.value)}
          placeholder="Additional detail (optional) - e.g. E05a, b, E04 (GLY)"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {(selectedType || typeInput) && (
        <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5">
          <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs font-medium text-indigo-800">{phaseName || '-'}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Start date *</label>
          <div className="relative">
            <input
              ref={startRef}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
              className="w-full cursor-text rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => startRef.current?.showPicker()}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
            >
              <Calendar size={15} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">End date *</label>
          <div className="relative">
            <input
              ref={endRef}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
              className="w-full cursor-text rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => endRef.current?.showPicker()}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
            >
              <Calendar size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-500">Assigned to</label>
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setAssignMode('person')}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                assignMode === 'person' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              )}
            >
              <User size={11} /> Person
            </button>
            <button
              type="button"
              onClick={() => setAssignMode('trade')}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                assignMode === 'trade' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              )}
            >
              <Wrench size={11} /> Trade / Role
            </button>
          </div>
        </div>

        {assignMode === 'person' ? (
          <select
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
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
                      <ChevronDown size={14} /> Use &ldquo;{normalizeOption(tradeInput)}&rdquo; once
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

      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as Phase['status'])}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
          <option value="skipped">Skipped</option>
        </select>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {DEFAULT_PHASE_COLORS.slice(0, 8).map((phaseColor) => (
            <button
              key={phaseColor}
              type="button"
              onClick={() => setColor(phaseColor)}
              className="h-5 w-5 flex-shrink-0 rounded-full border-2 transition-all"
              style={{ backgroundColor: phaseColor, borderColor: color === phaseColor ? '#0f172a' : 'transparent' }}
            />
          ))}
        </div>
      </div>

      <input
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" loading={loading}>
          {phase ? 'Save' : 'Add phase'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
