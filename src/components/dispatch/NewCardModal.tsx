'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DispatchColumn, DispatchCard } from '@/types/app'
import { createDispatchCard } from '@/app/app/dispatch/actions'

interface Props {
  open: boolean
  boardId: string
  columnId: string | null
  columns: DispatchColumn[]
  onClose: () => void
  onCreated: (card: DispatchCard) => void
}

export function NewCardModal({ open, boardId, columnId, columns, onClose, onCreated }: Props) {
  const [isPending, startTransition] = useTransition()
  const [store, setStore] = useState('')
  const [urgency, setUrgency] = useState('medium')
  const [scNumber, setScNumber] = useState('')
  const [description, setDescription] = useState('')
  const [dateStarted, setDateStarted] = useState('')
  const [selectedColumn, setSelectedColumn] = useState(columnId ?? '')
  const [error, setError] = useState('')

  // Sync column when prop changes
  const effectiveColumn = selectedColumn || columnId || columns[0]?.id || ''

  const handleClose = () => {
    setStore('')
    setUrgency('medium')
    setScNumber('')
    setDescription('')
    setDateStarted('')
    setSelectedColumn('')
    setError('')
    onClose()
  }

  const handleSubmit = () => {
    setError('')
    const fd = new FormData()
    fd.set('boardId', boardId)
    fd.set('columnId', effectiveColumn)
    fd.set('store', store)
    fd.set('urgency', urgency)
    fd.set('sc_number', scNumber)
    fd.set('description', description)
    fd.set('date_started', dateStarted)

    startTransition(async () => {
      const result = await createDispatchCard(fd)
      if (result.error) {
        setError(result.error)
        return
      }
      // Build a minimal card object for optimistic update
      const col = columns.find(c => c.id === effectiveColumn) ?? null
      const newCard: DispatchCard = {
        id: result.cardId!,
        company_id: '',
        board_id: boardId,
        column_id: effectiveColumn || null,
        store: store || null,
        urgency: urgency as DispatchCard['urgency'],
        date_started: dateStarted || null,
        sc_number: scNumber || null,
        kalos_job_number: null,
        eta_scheduled: null,
        rack_circuit_case: null,
        description: description || null,
        part_ordered: false,
        who_ordered: null,
        notes: null,
        assigned_to: null,
        vendor_id: null,
        vendor_email: null,
        gmail_thread_id: null,
        last_gmail_msg_id: null,
        last_email_date: null,
        email_sender: null,
        email_subject: null,
        needs_review: false,
        source: 'manual',
        closed_at: null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      onCreated(newCard)
      handleClose()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Card" size="md">
      <div className="space-y-4">
        {/* Column */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Column</label>
          <select
            value={effectiveColumn}
            onChange={e => setSelectedColumn(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
          >
            {columns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Store */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Store</label>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
            placeholder="Store name or location"
            value={store}
            onChange={e => setStore(e.target.value)}
          />
        </div>

        {/* Urgency + Date Started */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Urgency</label>
            <select
              value={urgency}
              onChange={e => setUrgency(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date Started</label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
              value={dateStarted}
              onChange={e => setDateStarted(e.target.value)}
            />
          </div>
        </div>

        {/* SC # */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SC #</label>
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
            placeholder="Service call number"
            value={scNumber}
            onChange={e => setScNumber(e.target.value)}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white resize-none"
            placeholder="Describe the issue..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} loading={isPending}>Create Card</Button>
        </div>
      </div>
    </Modal>
  )
}
