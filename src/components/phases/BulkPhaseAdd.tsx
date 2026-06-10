'use client'

import { useState } from 'react'
import { addDays, format } from 'date-fns'
import { ListPlus, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { DEFAULT_PHASE_COLORS, DEFAULT_PHASES } from '@/lib/constants'
import { touchProjectAudit } from '@/lib/projectAudit'
import { Phase } from '@/types/app'

interface BulkPhaseAddProps {
  projectId: string
  currentUserId: string
  startSortOrder: number
  onSave: (phases: Phase[]) => void
  onCancel: () => void
}

export function BulkPhaseAdd({
  projectId,
  currentUserId,
  startSortOrder,
  onSave,
  onCancel,
}: BulkPhaseAddProps) {
  const [text, setText] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [duration, setDuration] = useState('5')
  const [mode, setMode] = useState<'sequential' | 'same'>('sequential')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const useTemplate = () => {
    setText(DEFAULT_PHASES.join('\n'))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (lines.length === 0) {
      setError('Add at least one task (one per line).')
      return
    }

    const dur = Math.max(1, Number(duration) || 1)
    setLoading(true)
    setError(null)

    const base = startDate || format(new Date(), 'yyyy-MM-dd')
    let cursor = new Date(`${base}T00:00:00`)

    const rows = lines.map((name, index) => {
      const start = mode === 'same' ? new Date(`${base}T00:00:00`) : new Date(cursor)
      const end = addDays(start, dur - 1)
      if (mode === 'sequential') {
        cursor = addDays(start, dur)
      }
      return {
        project_id: projectId,
        name,
        start_date: format(start, 'yyyy-MM-dd'),
        end_date: format(end, 'yyyy-MM-dd'),
        status: 'not_started',
        color: DEFAULT_PHASE_COLORS[(startSortOrder + index) % DEFAULT_PHASE_COLORS.length],
        sort_order: startSortOrder + index,
      }
    })

    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('phases')
      .insert(rows)
      .select()

    if (insertError) {
      console.error('Bulk phase insert error:', insertError)
      setError(`Failed to add tasks: ${insertError.message}`)
      setLoading(false)
      return
    }

    if (data) {
      await touchProjectAudit(supabase, projectId, currentUserId)
      onSave(data as Phase[])
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Tasks — one per line
        </label>
        <button
          type="button"
          onClick={useTemplate}
          className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <Sparkles size={12} /> Use starter template
        </button>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={7}
        placeholder={'Demo\nRough-In\nInstallation\nInspection\nCloseout'}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Days per task</label>
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setMode('sequential')}
          className={`flex-1 rounded-md px-2.5 py-1.5 font-medium transition-all ${
            mode === 'sequential' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
          }`}
        >
          Stack back-to-back
        </button>
        <button
          type="button"
          onClick={() => setMode('same')}
          className={`flex-1 rounded-md px-2.5 py-1.5 font-medium transition-all ${
            mode === 'same' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
          }`}
        >
          Same start date
        </button>
      </div>

      <p className="text-xs text-slate-400">
        {lines.length > 0
          ? `${lines.length} task${lines.length === 1 ? '' : 's'} ready — you can drag to reschedule on the Gantt after.`
          : 'Paste or type your task list, then fine-tune dates on the Gantt.'}
      </p>

      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={loading} className="flex-1">
          <ListPlus size={15} /> Add {lines.length > 0 ? lines.length : ''} task{lines.length === 1 ? '' : 's'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
