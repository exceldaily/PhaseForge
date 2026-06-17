'use client'

import { useEffect, useState } from 'react'
import { Phase, PhaseChecklist, Profile } from '@/types/app'
import { X, Plus, Check, Trash2, UserCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { addPhaseChecklist, updatePhaseChecklist, deletePhaseChecklist, updatePhaseReminders } from '@/app/app/projects/[id]/actions'

interface PhaseChecklistModalProps {
  phase: Phase & { checklists?: PhaseChecklist[] }
  projectId: string
  members?: Profile[]
  onClose: () => void
  onSave?: () => void
}

export function PhaseChecklistModal({ phase, members = [], onClose, onSave }: PhaseChecklistModalProps) {
  const [checklists, setChecklists] = useState<PhaseChecklist[]>(phase.checklists || [])
  const [loading, setLoading] = useState(true)
  const [reminderNotes, setReminderNotes] = useState(phase.reminder_notes || '')
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [saving, setSaving] = useState(false)

  // Always load the latest items straight from the DB when the modal opens, so
  // previously-added items show up (the project page doesn't preload them).
  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('phase_checklists')
        .select('*')
        .eq('phase_id', phase.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (active) {
        setChecklists((data as PhaseChecklist[]) ?? [])
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [phase.id])

  const handleAddChecklist = async () => {
    if (!newChecklistTitle.trim()) return
    setSaving(true)
    const result = await addPhaseChecklist(phase.id, newChecklistTitle.trim())
    setSaving(false)
    if (result.success && result.checklist) {
      setChecklists([...checklists, result.checklist])
      setNewChecklistTitle('')
    }
  }

  const handleToggleChecklist = async (checklistId: string, isCompleted: boolean) => {
    setChecklists(checklists.map(c => c.id === checklistId ? { ...c, is_completed: !isCompleted } : c))
    await updatePhaseChecklist(checklistId, { is_completed: !isCompleted })
  }

  const handleAssign = async (checklistId: string, assignedTo: string) => {
    const value = assignedTo || null
    setChecklists(checklists.map(c => c.id === checklistId ? { ...c, assigned_to: value } : c))
    await updatePhaseChecklist(checklistId, { assigned_to: value })
  }

  const handleDeleteChecklist = async (checklistId: string) => {
    setChecklists(checklists.filter(c => c.id !== checklistId))
    await deletePhaseChecklist(checklistId)
  }

  const handleSaveReminders = async () => {
    setSaving(true)
    await updatePhaseReminders(phase.id, reminderNotes)
    setSaving(false)
    if (onSave) onSave()
  }

  const completedCount = checklists.filter(c => c.is_completed).length
  const totalCount = checklists.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{phase.name}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[600px] overflow-y-auto px-6 py-4 space-y-6">
          {/* Checklist section */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-slate-900">Checklist</h3>
              {totalCount > 0 && (
                <span className="text-xs text-slate-500">{completedCount} of {totalCount} complete</span>
              )}
            </div>

            {/* Add checklist item (top, so it's the obvious action) */}
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newChecklistTitle}
                onChange={e => setNewChecklistTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
                placeholder="Add a task…"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={saving}
              />
              <button
                onClick={handleAddChecklist}
                disabled={saving || !newChecklistTitle.trim()}
                className="rounded-lg bg-indigo-600 px-3 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus size={18} />
              </button>
            </div>

            {/* Checklist items */}
            <div className="space-y-2">
              {loading ? (
                <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
              ) : checklists.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No tasks yet — add one above.</p>
              ) : (
                checklists.map(item => {
                  const assignee = members.find(m => m.id === item.assigned_to)
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleChecklist(item.id, item.is_completed)}
                          className={`flex-shrink-0 rounded border-2 w-5 h-5 flex items-center justify-center transition ${
                            item.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'
                          }`}
                        >
                          {item.is_completed && <Check size={14} className="text-white" />}
                        </button>

                        <span className={`flex-1 text-sm ${item.is_completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {item.title}
                        </span>

                        <button
                          onClick={() => handleDeleteChecklist(item.id)}
                          className="flex-shrink-0 rounded p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {/* Assignee dropdown */}
                      {members.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 pl-8">
                          <UserCircle2 size={14} className={assignee ? 'text-indigo-500' : 'text-slate-300'} />
                          <select
                            value={item.assigned_to ?? ''}
                            onChange={e => handleAssign(item.id, e.target.value)}
                            className={`rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              assignee ? 'text-slate-700' : 'text-slate-400'
                            }`}
                          >
                            <option value="">Unassigned</option>
                            {members.map(m => (
                              <option key={m.id} value={m.id}>{m.full_name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Reminder notes section */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Reminder Notes</label>
            <textarea
              value={reminderNotes}
              onChange={e => setReminderNotes(e.target.value)}
              placeholder="Add reminders, important dates, special instructions..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={4}
              disabled={saving}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 flex gap-2 px-6 py-4 justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
          <button
            onClick={handleSaveReminders}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save notes'}
          </button>
        </div>
      </div>
    </div>
  )
}
