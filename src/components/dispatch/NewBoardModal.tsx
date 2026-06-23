'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createDispatchBoard } from '@/app/app/dispatch/actions'

const TEMPLATES: Record<string, { label: string; columns: Array<{ name: string; color: string; is_done: boolean }> }> = {
  refrigeration: {
    label: 'Refrigeration Service',
    columns: [
      { name: 'New Call',            color: '#6366f1', is_done: false },
      { name: 'Reviewing',           color: '#8b5cf6', is_done: false },
      { name: 'Forwarded to Vendor', color: '#f59e0b', is_done: false },
      { name: 'Scheduled',           color: '#3b82f6', is_done: false },
      { name: 'Waiting on Parts',    color: '#f97316', is_done: false },
      { name: 'In Progress',         color: '#10b981', is_done: false },
      { name: 'Completed',           color: '#22c55e', is_done: true  },
      { name: 'Closed',              color: '#94a3b8', is_done: true  },
      { name: 'Needs Follow-Up',     color: '#ef4444', is_done: false },
    ],
  },
  construction: {
    label: 'Construction Punch',
    columns: [
      { name: 'New Issue',           color: '#6366f1', is_done: false },
      { name: 'Assigned',            color: '#8b5cf6', is_done: false },
      { name: 'In Progress',         color: '#3b82f6', is_done: false },
      { name: 'Needs Material',      color: '#f97316', is_done: false },
      { name: 'Ready for Inspection',color: '#f59e0b', is_done: false },
      { name: 'Completed',           color: '#22c55e', is_done: true  },
      { name: 'Closed',              color: '#94a3b8', is_done: true  },
    ],
  },
  controls: {
    label: 'EMS / Controls',
    columns: [
      { name: 'New Ticket',  color: '#6366f1', is_done: false },
      { name: 'Triaged',     color: '#8b5cf6', is_done: false },
      { name: 'Assigned',    color: '#3b82f6', is_done: false },
      { name: 'In Progress', color: '#10b981', is_done: false },
      { name: 'Testing',     color: '#f59e0b', is_done: false },
      { name: 'Resolved',    color: '#22c55e', is_done: true  },
      { name: 'Closed',      color: '#94a3b8', is_done: true  },
    ],
  },
  custom: {
    label: 'Custom (blank)',
    columns: [
      { name: 'Open',       color: '#6366f1', is_done: false },
      { name: 'In Progress',color: '#3b82f6', is_done: false },
      { name: 'Done',       color: '#22c55e', is_done: true  },
    ],
  },
}

interface Props {
  open: boolean
  onClose: () => void
}

export function NewBoardModal({ open, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState<keyof typeof TEMPLATES>('refrigeration')
  const [columns, setColumns] = useState(TEMPLATES.refrigeration.columns.map(c => ({ ...c })))
  const [error, setError] = useState('')

  const handleTemplateChange = (t: keyof typeof TEMPLATES) => {
    setTemplate(t)
    setColumns(TEMPLATES[t].columns.map(c => ({ ...c })))
  }

  const addColumn = () => {
    setColumns(prev => [...prev, { name: '', color: '#94a3b8', is_done: false }])
  }

  const removeColumn = (i: number) => {
    setColumns(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateColumn = (i: number, key: string, value: string | boolean) => {
    setColumns(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: value } : c))
  }

  const handleSubmit = () => {
    if (!name.trim()) { setError('Board name is required'); return }
    if (columns.some(c => !c.name.trim())) { setError('All columns must have a name'); return }
    setError('')

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('description', description.trim())
    fd.set('columns', JSON.stringify(columns))

    startTransition(async () => {
      const result = await createDispatchBoard(fd)
      if (result.error) {
        setError(result.error)
        return
      }
      setName('')
      setDescription('')
      setTemplate('refrigeration')
      setColumns(TEMPLATES.refrigeration.columns.map(c => ({ ...c })))
      onClose()
      if (result.boardId) router.push(`/app/dispatch/${result.boardId}`)
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="New Dispatch Board" size="lg">
      <div className="space-y-5">
        {/* Name + description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Board Name <span className="text-rose-500">*</span>
          </label>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
            placeholder="e.g. Refrigeration Service"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white resize-none"
            placeholder="Optional description..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* Template picker */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start from template</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(TEMPLATES) as [keyof typeof TEMPLATES, { label: string }][]).map(([key, t]) => (
              <button
                key={key}
                onClick={() => handleTemplateChange(key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium text-left border transition-all ${
                  template === key
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Column editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Columns</label>
            <button
              onClick={addColumn}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium"
            >
              <Plus size={12} /> Add column
            </button>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {columns.map((col, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="color"
                  value={col.color}
                  onChange={e => updateColumn(i, 'color', e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                  title="Column color"
                />
                <input
                  className="flex-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
                  placeholder="Column name"
                  value={col.name}
                  onChange={e => updateColumn(i, 'name', e.target.value)}
                />
                <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  <input
                    type="checkbox"
                    checked={col.is_done}
                    onChange={e => updateColumn(i, 'is_done', e.target.checked)}
                    className="rounded"
                  />
                  Done
                </label>
                <button
                  onClick={() => removeColumn(i)}
                  className="text-slate-400 hover:text-rose-500 transition-colors"
                  title="Remove column"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} loading={isPending}>Create Board</Button>
        </div>
      </div>
    </Modal>
  )
}
