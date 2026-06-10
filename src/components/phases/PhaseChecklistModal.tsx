'use client'

import { useState } from 'react'
import { Phase, PhaseChecklist } from '@/types/app'
import { X, Plus, Check, Trash2 } from 'lucide-react'
import { addPhaseChecklist, updatePhaseChecklist, deletePhaseChecklist, updatePhaseReminders } from '@/app/app/projects/[id]/actions'

interface PhaseChecklistModalProps {
  phase: Phase & { checklists?: PhaseChecklist[] }
  projectId: string
  onClose: () => void
  onSave?: () => void
}

export function PhaseChecklistModal({ phase, projectId, onClose, onSave }: PhaseChecklistModalProps) {
  const [checklists, setChecklists] = useState<PhaseChecklist[]>(phase.checklists || [])
  const [reminderNotes, setReminderNotes] = useState(phase.reminder_notes || '')
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [saving, setSaving] = useState(false)

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
    setSaving(true)
    await updatePhaseChecklist(checklistId, { is_completed: !isCompleted })
    setSaving(false)

    setChecklists(
      checklists.map(c => c.id === checklistId ? { ...c, is_completed: !isCompleted } : c)
    )
  }

  const handleDeleteChecklist = async (checklistId: string) => {
    setSaving(true)
    await deletePhaseChecklist(checklistId)
    setSaving(false)

    setChecklists(checklists.filter(c => c.id !== checklistId))
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
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-slate-100"
          >
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
                <span className="text-xs text-slate-500">
                  {completedCount} of {totalCount} complete
                </span>
              )}
            </div>

            {/* Checklist items */}
            <div className="space-y-2 mb-3">
              {checklists.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 transition"
                >
                  <button
                    onClick={() => handleToggleChecklist(item.id, item.is_completed)}
                    disabled={saving}
                    className={`flex-shrink-0 rounded border-2 w-5 h-5 flex items-center justify-center transition ${
                      item.is_completed
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-slate-300 hover:border-emerald-400'
                    }`}
                  >
                    {item.is_completed && <Check size={14} className="text-white" />}
                  </button>

                  <span
                    className={`flex-1 text-sm ${
                      item.is_completed
                        ? 'line-through text-slate-400'
                        : 'text-slate-900'
                    }`}
                  >
                    {item.title}
                  </span>

                  <button
                    onClick={() => handleDeleteChecklist(item.id)}
                    disabled={saving}
                    className="flex-shrink-0 rounded p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add checklist item */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newChecklistTitle}
                onChange={e => setNewChecklistTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
                placeholder="Add a checklist item..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={saving}
              />
              <button
                onClick={handleAddChecklist}
                disabled={saving || !newChecklistTitle.trim()}
                className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Reminder notes section */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">
              Reminder Notes
            </label>
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
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveReminders}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
