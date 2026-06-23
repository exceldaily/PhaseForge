'use client'

import { useState } from 'react'
import { X, Settings, Mail, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { DispatchBoard, DispatchColumn } from '@/types/app'
import { updateBoardSettings } from '@/app/app/dispatch/actions'

interface Props {
  board: DispatchBoard
  columns: DispatchColumn[]
  onClose: () => void
  onUpdated: (board: DispatchBoard) => void
}

export function BoardSettingsModal({ board, columns, onClose, onUpdated }: Props) {
  const [gmailLabel, setGmailLabel] = useState(board.gmail_label ?? '')
  const [defaultColumnId, setDefaultColumnId] = useState(board.gmail_default_column_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    const fd = new FormData()
    fd.set('boardId', board.id)
    fd.set('gmailLabel', gmailLabel.trim())
    fd.set('gmailDefaultColumnId', defaultColumnId)

    const result = await updateBoardSettings(fd)
    setSaving(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      onUpdated({ ...board, gmail_label: gmailLabel.trim() || null, gmail_default_column_id: defaultColumnId || null })
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <Settings size={17} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex-1">
            Board Settings — {board.name}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          {/* Gmail intake label */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Mail size={14} className="text-indigo-500" />
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                Gmail Intake Label
              </label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Emails you label with this in Gmail will auto-create cards here.
              The label will be created in Gmail if it doesn&apos;t exist yet.
            </p>
            <input
              type="text"
              value={gmailLabel}
              onChange={e => setGmailLabel(e.target.value)}
              placeholder="e.g. Dispatch/Sprouts"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Processed emails are automatically re-labeled to <span className="font-mono">Dispatch/Logged</span>
            </p>
          </div>

          {/* Default landing column */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1.5">
              Email Cards Land In
            </label>
            <select
              value={defaultColumnId}
              onChange={e => setDefaultColumnId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">First column (default)</option>
              {columns.map(col => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
          </div>

          {/* Connect Gmail prompt */}
          {!gmailLabel && (
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-3">
              <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium mb-1">
                Gmail not connected yet
              </p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2">
                An admin must authorize the Gmail account before email sync will work.
              </p>
              <a
                href="/api/dispatch/gmail-auth"
                className="inline-flex items-center gap-1 text-xs text-indigo-700 dark:text-indigo-300 font-medium hover:underline"
              >
                Connect Gmail account
                <ExternalLink size={11} />
              </a>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saved ? (
                <>
                  <CheckCircle size={14} />
                  Saved
                </>
              ) : saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
