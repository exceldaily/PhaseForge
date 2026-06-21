'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, X, Loader2, CheckCircle2 } from 'lucide-react'
import { completePunchItem } from '@/app/app/projects/[id]/punch-actions'
import { compressImage } from '@/lib/punch'
import { PunchItem } from '@/types/app'

interface PunchCompleteFormProps {
  item: PunchItem
  onClose: () => void
}

export function PunchCompleteForm({ item, onClose }: PunchCompleteFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setPhoto(compressed)
    setPreview(URL.createObjectURL(compressed))
  }

  const handleSubmit = async () => {
    setError('')
    if (!photo) { setError('A completion photo is required.'); return }
    if (!description.trim()) { setError('A completion description is required.'); return }

    setSaving(true)
    const result = await completePunchItem(item.id, {
      completionPhoto: photo,
      completion_description: description,
    })
    setSaving(false)

    if (!result.success) { setError(result.error); return }
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <h2 className="text-base font-semibold text-slate-900">
              Complete punch item {item.number ? `#${item.number}` : ''}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Both a completion photo and description are required to close this item.
          </p>

          {/* Completion photo (required) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Completion photo <span className="text-rose-500">*</span>
            </label>
            {preview ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Completion preview" className="h-52 w-full object-cover" />
                <button
                  onClick={() => { setPhoto(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="absolute right-2 top-2 rounded-lg bg-slate-900/60 p-1.5 text-white hover:bg-slate-900/80"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
              >
                <Camera size={30} className="text-slate-400" />
                <span className="text-sm font-medium">Take or upload completion photo</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="hidden"
            />
          </div>

          {/* Completion description (required) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Completion description <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe how the issue was resolved…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Saving…' : 'Mark complete'}
          </button>
        </div>
      </div>
    </div>
  )
}
