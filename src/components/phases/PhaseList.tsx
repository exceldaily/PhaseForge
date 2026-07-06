'use client'
import { useState } from 'react'
import { Plus, ListPlus } from 'lucide-react'
import { Phase, Profile } from '@/types/app'
import { PhaseRow } from './PhaseRow'
import { PhaseForm } from './PhaseForm'
import { BulkPhaseAdd } from './BulkPhaseAdd'
import { PhaseChecklistModal } from './PhaseChecklistModal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getPhasePercentForStatusChange, shouldRetryLegacyPhaseWrite } from '@/lib/phaseProgress'
import { touchProjectAudit } from '@/lib/projectAudit'
import { unsyncPhaseFromCalendar } from '@/app/app/projects/[id]/scheduleActions'

interface PhaseListProps {
  projectId: string
  companyId: string
  phases: Phase[]
  members: Profile[]
  currentUserId: string
  canEdit: boolean
}

export function PhaseList({ projectId, companyId, phases: initialPhases, members, currentUserId, canEdit }: PhaseListProps) {
  const router = useRouter()
  const [phases, setPhases] = useState(initialPhases)
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null)
  const [checklistPhase, setChecklistPhase] = useState<Phase | null>(null)

  const handleDelete = async (phaseId: string) => {
    const supabase = createClient()
    // Remove the linked Google event first (no-op when not synced) so deleting
    // a phase never orphans an event on the calendar.
    try { await unsyncPhaseFromCalendar(phaseId) } catch { /* never block delete */ }
    const { error } = await supabase.from('phases').delete().eq('id', phaseId)
    if (!error) {
      await touchProjectAudit(supabase, projectId, currentUserId)
    }
    setPhases(p => p.filter(ph => ph.id !== phaseId))
    router.refresh()
  }

  const handleSave = (phase: Phase) => {
    if (editingPhase) {
      setPhases(p => p.map(ph => ph.id === phase.id ? phase : ph))
      setEditingPhase(null)
    } else {
      setPhases(p => [...p, phase])
      setShowForm(false)
    }
    router.refresh()
  }

  const handleBulkSave = (newPhases: Phase[]) => {
    setPhases(p => [...p, ...newPhases])
    setShowBulk(false)
    router.refresh()
  }

  const handleStatusChange = async (phaseId: string, status: string) => {
    const currentPhase = phases.find((phase) => phase.id === phaseId)
    const percentComplete = getPhasePercentForStatusChange(
      status as Phase['status'],
      currentPhase?.percent_complete
    )
    const supabase = createClient()
    let { error } = await supabase
      .from('phases')
      .update({ status, percent_complete: percentComplete, updated_at: new Date().toISOString() })
      .eq('id', phaseId)

    let nextPercentComplete = percentComplete
    if (error && shouldRetryLegacyPhaseWrite(error.message)) {
      const fallback = await supabase
        .from('phases')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', phaseId)
      error = fallback.error
      nextPercentComplete = currentPhase?.percent_complete ?? percentComplete
    }

    await touchProjectAudit(supabase, projectId, currentUserId)
    setPhases((current) =>
      current.map((phase) =>
        phase.id === phaseId
          ? { ...phase, status: status as Phase['status'], percent_complete: nextPercentComplete }
          : phase
      )
    )
    router.refresh()
  }

  return (
    <div>
      {phases.length === 0 && !showForm && !showBulk && (
        <div className="px-6 py-12 text-center">
          <p className="text-slate-400 text-sm mb-3">No phases yet. Add your first phase to get started.</p>
          {canEdit && (
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus size={15} /> Add Phase
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowBulk(true)}>
                <ListPlus size={15} /> Bulk add
              </Button>
            </div>
          )}
        </div>
      )}

      {showBulk && (
        <div className="border-b border-slate-100 p-4">
          <BulkPhaseAdd
            projectId={projectId}
            currentUserId={currentUserId}
            startSortOrder={phases.length}
            onSave={handleBulkSave}
            onCancel={() => setShowBulk(false)}
          />
        </div>
      )}

      {phases.map(phase => (
        editingPhase?.id === phase.id ? (
          <div key={phase.id} className="border-b border-slate-100 p-4">
            <PhaseForm
              projectId={projectId}
              companyId={companyId}
              members={members}
              phase={phase}
              currentUserId={currentUserId}
              onSave={handleSave}
              onCancel={() => setEditingPhase(null)}
              sortOrder={phase.sort_order}
            />
          </div>
        ) : (
          <PhaseRow
            key={phase.id}
            phase={phase}
            members={members}
            canEdit={canEdit}
            onEdit={() => setEditingPhase(phase)}
            onDelete={() => handleDelete(phase.id)}
            onStatusChange={(status) => handleStatusChange(phase.id, status)}
            onShowChecklist={() => setChecklistPhase(phase)}
          />
        )
      ))}

      {showForm && (
        <div className="border-t border-slate-100 p-4">
          <PhaseForm
            projectId={projectId}
            companyId={companyId}
            members={members}
            currentUserId={currentUserId}
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
            sortOrder={phases.length}
          />
        </div>
      )}

      {canEdit && phases.length > 0 && !showForm && !showBulk && !editingPhase && (
        <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-100">
          <Button variant="ghost" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={15} /> Add Phase
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowBulk(true)}>
            <ListPlus size={15} /> Bulk add
          </Button>
        </div>
      )}

      {checklistPhase && (
        <PhaseChecklistModal
          phase={checklistPhase}
          projectId={projectId}
          members={members}
          onClose={() => {
            setChecklistPhase(null)
            router.refresh()
          }}
          onSave={() => {
            setChecklistPhase(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
