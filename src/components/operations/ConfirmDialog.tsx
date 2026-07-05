'use client'

// Consistent confirmation dialog for destructive actions across the app.
// Replaces window.confirm(): explains permanence, shows inline errors, and
// guards against double-clicks while the action is running.

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  permanent = true,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  permanent?: boolean
  onConfirm: () => Promise<{ error?: string } | void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await onConfirm()
      if (result && 'error' in result && result.error) {
        setError(result.error)
      } else {
        onClose()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-rose-100 p-2 text-rose-600">
            <AlertTriangle size={18} />
          </span>
          <div className="text-sm text-slate-600">
            <p>{message}</p>
            {permanent && (
              <p className="mt-1.5 font-medium text-slate-700">This cannot be undone.</p>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirm} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}
