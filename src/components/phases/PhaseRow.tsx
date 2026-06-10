'use client'
import { useState } from 'react'
import { AlertTriangle, Flag, MoreHorizontal, Pencil, Trash2, GripVertical, Wrench } from 'lucide-react'
import { Phase, Profile, PhaseStatus } from '@/types/app'
import { Avatar } from '@/components/ui/Avatar'
import { PHASE_STATUS_LABELS, PHASE_STATUS_COLORS } from '@/lib/constants'
import { formatDate, isOverdue } from '@/lib/dates'
import { getPhasePercentComplete } from '@/lib/phaseProgress'
import { cn } from '@/lib/utils'

interface PhaseRowProps {
  phase: Phase
  members: Profile[]
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (status: string) => void
  onShowChecklist?: () => void
}

export function PhaseRow({ phase, members, canEdit, onEdit, onDelete, onStatusChange, onShowChecklist }: PhaseRowProps) {
  const [showMenu, setShowMenu] = useState(false)
  const assignee = members.find(m => m.id === phase.assigned_to)
  const assignedTrade = phase.assigned_trade?.trim()
  const overdue = isOverdue(phase.end_date, phase.status)
  const percentComplete = getPhasePercentComplete(phase)

  return (
    <div className={cn(
      'flex items-center gap-3 px-6 py-3.5 border-b border-slate-100 hover:bg-slate-50 group transition-colors',
      overdue && 'bg-rose-50/40 hover:bg-rose-50'
    )}>
      <GripVertical size={16} className="text-slate-300 flex-shrink-0 cursor-grab" />

      {/* Color dot */}
      <div
        className="h-3 w-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: phase.color || PHASE_STATUS_COLORS[phase.status as PhaseStatus] }}
      />

      {/* Phase name */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm font-medium', overdue ? 'text-rose-700' : 'text-slate-900')}>{phase.name}</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {percentComplete}%
          </span>
          {phase.is_milestone && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
              <Flag size={10} /> Milestone
            </span>
          )}
          {phase.is_critical_path && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
              <AlertTriangle size={10} /> Critical
            </span>
          )}
        </div>
        {phase.notes && <p className="text-xs text-slate-400 truncate mt-0.5">{phase.notes}</p>}
      </div>

      {/* Dates */}
      <div className="hidden md:flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
        <span>{formatDate(phase.start_date, 'MMM d')}</span>
        <span className="text-slate-300">→</span>
        <span className={overdue ? 'text-rose-600 font-medium' : ''}>{formatDate(phase.end_date, 'MMM d')}</span>
      </div>

      {/* Assignee */}
      <div className="hidden lg:block flex-shrink-0">
        {assignee ? (
          <div className="flex items-center gap-1.5">
            <Avatar name={assignee.full_name} avatarUrl={assignee.avatar_url} size="xs" />
            <span className="text-xs text-slate-500">{assignee.full_name.split(' ')[0]}</span>
          </div>
        ) : assignedTrade ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Wrench size={12} className="text-slate-400" />
            <span className="max-w-28 truncate">{assignedTrade}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-300">Unassigned</span>
        )}
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        {canEdit ? (
          <select
            value={phase.status}
            onChange={e => onStatusChange(e.target.value)}
            className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 cursor-pointer font-medium"
            style={{ color: PHASE_STATUS_COLORS[phase.status as PhaseStatus] }}
          >
            {Object.entries(PHASE_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-medium" style={{ color: PHASE_STATUS_COLORS[phase.status as PhaseStatus] }}>
            {PHASE_STATUS_LABELS[phase.status as PhaseStatus]}
          </span>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                <button onClick={() => { setShowMenu(false); onShowChecklist?.() }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <Wrench size={14} /> Details
                </button>
                <button onClick={() => { setShowMenu(false); onEdit() }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <Pencil size={14} /> Edit
                </button>
                <button onClick={() => { setShowMenu(false); onDelete() }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
