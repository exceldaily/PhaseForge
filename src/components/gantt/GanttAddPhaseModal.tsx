'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { createPhaseQuick } from '@/app/app/projects/[id]/actions'

interface GanttAddPhaseModalProps {
  projectId: string
  onClose: () => void
  onSuccess?: () => void
}

export function GanttAddPhaseModal({ projectId, onClose, onSuccess }: GanttAddPhaseModalProps) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Phase name is required')
      return
    }
    if (!startDate) {
      setError('Start date is required')
      return
    }
    if (!endDate) {
      setError('End date is required')
      return
    }

    setLoading(true)
    const result = await createPhaseQuick(projectId, {
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
    })
    setLoading(false)

    if (result.success) {
      onClose()
      onSuccess?.()
    } else {
      setError(result.error || 'Failed to create phase')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Plus size={18} className="text-indigo-600" />
            Add Phase
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-slate-100"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Phase Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Foundation, Framing, Electrical"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Start Date *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              End Date *
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Add Phase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
