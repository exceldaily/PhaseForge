'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, FileText, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { bulkCreatePunchItems } from '@/app/app/projects/[id]/punch-actions'
import { parseXlsxClient, compressImage } from '@/lib/punchImportClient'
import type { PunchImportUploadResult, PunchImportPdfResult } from '@/app/api/punch/import/route'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  onClose: () => void
}

interface PreviewItem {
  description: string
  location: string | null
  issue_photo_path: string | null   // set after server upload
  issue_photo_url: string | null    // signed URL (after upload) or local blob URL (before)
  _localBlob?: Blob | null          // held until upload, then cleared
  _localPreview?: string | null     // object URL for preview before server upload
}

type Step = 'upload' | 'parsing' | 'preview' | 'importing' | 'done'

export function PunchImportModal({ projectId, onClose }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState<PreviewItem[]>([])
  const [error, setError] = useState('')
  const [created, setCreated] = useState(0)
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const handleFile = async (file: File) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['xlsx', 'xls', 'pdf'].includes(ext)) {
      setError('Please upload an .xlsx or .pdf file.')
      return
    }

    setError('')
    setFileName(file.name)
    setStep('parsing')

    try {
      if (ext === 'pdf') {
        // PDFs are small — send to server for text extraction
        const fd = new FormData()
        fd.append('pdf', file)
        fd.append('projectId', projectId)
        const res = await fetch('/api/punch/import', { method: 'POST', body: fd })
        const json = (await res.json()) as PunchImportPdfResult & { error?: string }
        if (!res.ok || json.error) { setError(json.error ?? 'Parse failed'); setStep('upload'); return }
        if (!json.items?.length) { setError('No items found in the PDF.'); setStep('upload'); return }
        setItems(json.items.map(it => ({ ...it, issue_photo_path: null, issue_photo_url: null })))
        setStep('preview')
        return
      }

      // XLSX: parse entirely in the browser — no server upload of the raw file
      const rows = await parseXlsxClient(file)
      if (!rows.length) { setError('No punch items found in the file.'); setStep('upload'); return }

      const preview: PreviewItem[] = rows.map(r => ({
        description: r.description,
        location: r.location,
        issue_photo_path: null,
        issue_photo_url: r.imagePreviewUrl,  // local object URL for instant preview
        _localBlob: r.imageBlob,
        _localPreview: r.imagePreviewUrl,
      }))
      setItems(preview)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed')
      setStep('upload')
    }
  }

  const removeItem = (idx: number) => {
    setItems(prev => {
      const next = [...prev]
      // Revoke local object URL to free memory
      if (next[idx]._localPreview) URL.revokeObjectURL(next[idx]._localPreview)
      next.splice(idx, 1)
      return next
    })
  }

  const handleImport = async () => {
    if (!items.length) return
    setStep('importing')
    setError('')

    try {
      const withImages = items.filter(it => it._localBlob)
      setProgress({ done: 0, total: withImages.length })

      // Upload images in batches of 3
      const uploaded = new Map<number, { path: string; url: string }>()
      const batchSize = 3

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        await Promise.all(
          batch.map(async (item, bIdx) => {
            const idx = i + bIdx
            if (!item._localBlob) return
            try {
              const compressed = await compressImage(item._localBlob)
              const fd = new FormData()
              fd.append('projectId', projectId)
              fd.append('image', compressed, 'photo.jpg')
              const res = await fetch('/api/punch/import', { method: 'POST', body: fd })
              if (res.ok) {
                const data = (await res.json()) as PunchImportUploadResult
                uploaded.set(idx, { path: data.issue_photo_path, url: data.issue_photo_url })
              }
            } catch { /* skip photo on individual failure, item still created */ }
            setProgress(p => ({ ...p, done: p.done + 1 }))
          })
        )
      }

      // Build final list — only items with a non-empty description
      const final = items
        .map((it, idx) => {
          const up = uploaded.get(idx)
          return {
            issue_description: (it.description ?? '').trim(),
            location: it.location,
            issue_photo_path: up?.path ?? it.issue_photo_path,
          }
        })
        .filter(it => it.issue_description.length > 0)

      if (!final.length) {
        setError('No valid items to import after filtering empty descriptions.')
        setStep('preview')
        return
      }

      const result = await bulkCreatePunchItems(projectId, final)
      if (!result.success) {
        setError((result as { error: string }).error ?? 'Import failed')
        setStep('preview')
        return
      }

      // Revoke remaining local object URLs
      items.forEach(it => { if (it._localPreview) URL.revokeObjectURL(it._localPreview) })

      setCreated((result as { created?: number }).created ?? items.length)
      setStep('done')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Import failed — please try again.')
      setStep('preview')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Import Punch Items</h2>
            {fileName && <p className="text-xs text-slate-400 mt-0.5">{fileName}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileSpreadsheet size={16} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-slate-700">Excel (.xlsx)</span>
                  </div>
                  <p className="text-xs text-slate-500">4 columns: Scope, Description, Location, Photo. Parsed in your browser — no file size limit.</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileText size={16} className="text-rose-600" />
                    <span className="text-sm font-semibold text-slate-700">PDF</span>
                  </div>
                  <p className="text-xs text-slate-500">Numbered table format. Descriptions extracted; photos must be added manually.</p>
                </div>
              </div>

              <div
                className={cn(
                  'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 cursor-pointer transition-colors',
                  dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                )}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={28} className="text-slate-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700">Drop your file here or click to browse</p>
                  <p className="text-xs text-slate-400 mt-0.5">.xlsx or .pdf</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          )}

          {step === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={32} className="animate-spin text-indigo-500" />
              <p className="text-sm text-slate-600">Reading file…</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">{items.length} items found — review before importing</p>
                <button onClick={() => { setItems([]); setStep('upload') }} className="text-xs text-slate-400 hover:text-slate-600">
                  Change file
                </button>
              </div>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden max-h-[50vh] overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
                    {item.issue_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.issue_photo_url} alt="" className="w-14 h-14 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-slate-300 text-center leading-tight">No photo</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 line-clamp-2">{item.description}</p>
                      {item.location && <p className="text-xs text-slate-400 mt-0.5">{item.location}</p>}
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-rose-500 flex-shrink-0 pt-0.5">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 size={32} className="animate-spin text-indigo-500" />
              {progress.total > 0 ? (
                <div className="w-full max-w-xs">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>Uploading photos…</span>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Creating punch items…</p>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle size={36} className="text-emerald-500" />
              <p className="text-base font-semibold text-slate-800">{created} items imported</p>
              <p className="text-sm text-slate-500">Punch list has been updated.</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <AlertCircle size={16} className="text-rose-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-4 flex items-center justify-end gap-2">
          {step === 'done' ? (
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              {step === 'preview' && items.length > 0 && (
                <button onClick={handleImport} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700">
                  Import {items.length} item{items.length !== 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
