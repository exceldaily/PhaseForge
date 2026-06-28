'use client'

import { useEffect, useRef, useState } from 'react'
import { Phase, PhaseChecklist, Profile } from '@/types/app'
import { X, Plus, Check, Trash2, UserCircle2, Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  addPhaseChecklist,
  attachChecklistPhoto,
  clearChecklistPhoto,
  deletePhaseChecklist,
  updatePhaseChecklist,
  updatePhaseReminders,
} from '@/app/app/projects/[id]/actions'
import { compressImage } from '@/lib/punch'

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
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingItemIdRef = useRef<string | null>(null)

  // Load latest items from DB when modal opens.
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
    return () => { active = false }
  }, [phase.id])

  // Fetch signed URLs for items that have photos but no cached URL yet.
  useEffect(() => {
    const supabase = createClient()
    checklists.forEach(async (item) => {
      if (!item.photo_path || signedUrls[item.id]) return
      const { data } = await supabase.storage
        .from('project-attachments')
        .createSignedUrl(item.photo_path, 3600)
      if (data?.signedUrl) {
        setSignedUrls(prev => ({ ...prev, [item.id]: data.signedUrl }))
      }
    })
  }, [checklists]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddChecklist = async () => {
    if (!newChecklistTitle.trim()) return
    setSaving(true)
    const result = await addPhaseChecklist(phase.id, newChecklistTitle.trim())
    setSaving(false)
    if (result.success && result.checklist) {
      setChecklists(prev => [...prev, result.checklist!])
      setNewChecklistTitle('')
    }
  }

  const handleToggleChecklist = async (checklistId: string, isCompleted: boolean) => {
    setChecklists(prev => prev.map(c => c.id === checklistId ? { ...c, is_completed: !isCompleted } : c))
    await updatePhaseChecklist(checklistId, { is_completed: !isCompleted })
  }

  const handleAssign = async (checklistId: string, assignedTo: string) => {
    const value = assignedTo || null
    setChecklists(prev => prev.map(c => c.id === checklistId ? { ...c, assigned_to: value } : c))
    await updatePhaseChecklist(checklistId, { assigned_to: value })
  }

  const handleDeleteChecklist = async (checklistId: string) => {
    setChecklists(prev => prev.filter(c => c.id !== checklistId))
    await deletePhaseChecklist(checklistId)
  }

  const handlePickPhoto = (checklistId: string) => {
    pendingItemIdRef.current = checklistId
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const itemId = pendingItemIdRef.current
    if (!file || !itemId) return
    e.target.value = ''

    const compressed = await compressImage(file)
    setUploadingId(itemId)

    const result = await attachChecklistPhoto(itemId, phase.id, compressed)
    setUploadingId(null)

    if (result.success) {
      setChecklists(prev => prev.map(c => c.id === itemId ? { ...c, photo_path: result.path } : c))
      if (result.signedUrl) {
        setSignedUrls(prev => ({ ...prev, [itemId]: result.signedUrl! }))
      }
    }
  }

  const handleClearPhoto = async (checklistId: string, photoPath: string) => {
    setChecklists(prev => prev.map(c => c.id === checklistId ? { ...c, photo_path: null } : c))
    setSignedUrls(prev => { const next = { ...prev }; delete next[checklistId]; return next })
    await clearChecklistPhoto(checklistId, photoPath)
  }

  const handleSaveReminders = async () => {
    setSaving(true)
    await updatePhaseReminders(phase.id, reminderNotes)
    setSaving(false)
    if (onSave) onSave()
  }

  const completedCount = checklists.filter(c => c.is_completed).length

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-lg">
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
                {checklists.length > 0 && (
                  <span className="text-xs text-slate-500">{completedCount} of {checklists.length} complete</span>
                )}
              </div>

              {/* Add item */}
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

              {/* Items list */}
              <div className="space-y-2">
                {loading ? (
                  <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
                ) : checklists.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">No tasks yet — add one above.</p>
                ) : (
                  checklists.map(item => {
                    const assignee = members.find(m => m.id === item.assigned_to)
                    const photoUrl = signedUrls[item.id]
                    const isUploading = uploadingId === item.id

                    return (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 transition">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => handleToggleChecklist(item.id, item.is_completed)}
                            className={`flex-shrink-0 rounded border-2 w-5 h-5 flex items-center justify-center transition ${
                              item.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'
                            }`}
                          >
                            {item.is_completed && <Check size={14} className="text-white" />}
                          </button>

                          <span className={`flex-1 text-sm min-w-0 ${item.is_completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {item.title}
                          </span>

                          {/* Photo slot */}
                          {isUploading ? (
                            <Loader2 size={16} className="flex-shrink-0 animate-spin text-indigo-500" />
                          ) : item.photo_path ? (
                            <button
                              onClick={() => photoUrl && setLightboxUrl(photoUrl)}
                              className="flex-shrink-0 h-8 w-8 overflow-hidden rounded border border-slate-200 bg-slate-100 hover:opacity-80 transition"
                              title="View photo"
                            >
                              {photoUrl
                                ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                                : <div className="flex h-full w-full items-center justify-center"><Camera size={13} className="text-slate-400" /></div>
                              }
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePickPhoto(item.id)}
                              className="flex-shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500 transition"
                              title="Add photo"
                            >
                              <Camera size={16} />
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteChecklist(item.id)}
                            className="flex-shrink-0 rounded p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Assignee + remove photo row */}
                        {(members.length > 0 || item.photo_path) && (
                          <div className="mt-2 flex items-center justify-between pl-7">
                            {item.photo_path ? (
                              <button
                                onClick={() => handleClearPhoto(item.id, item.photo_path!)}
                                className="text-xs text-rose-500 hover:text-rose-700 transition"
                              >
                                Remove photo
                              </button>
                            ) : <div />}

                            {members.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <UserCircle2 size={13} className={assignee ? 'text-indigo-500' : 'text-slate-300'} />
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
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Reminder notes */}
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Checklist photo" className="max-h-[90vh] max-w-[90vw] rounded object-contain" />
          <button
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  )
}
