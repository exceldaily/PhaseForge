'use client'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { unsyncAllProjectPhases } from '@/app/app/projects/[id]/scheduleActions'

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    const supabase = createClient()
    // Remove Google Calendar events BEFORE the delete cascade wipes the links
    // that know their ids — otherwise the events are orphaned forever.
    try { await unsyncAllProjectPhases(projectId) } catch { /* never block delete */ }
    await supabase.from('projects').delete().eq('id', projectId)
    router.push('/app/projects')
    router.refresh()
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">
        <span className="text-sm text-rose-800 font-medium">Delete &ldquo;{projectName}&rdquo;?</span>
        <Button variant="danger" size="sm" onClick={handleDelete} loading={loading}>Yes, delete</Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
      </div>
    )
  }

  return (
    <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
      <Trash2 size={14} /> Delete Project
    </Button>
  )
}
