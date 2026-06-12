'use client'

import { useState, useRef } from 'react'
import { Paperclip, Upload, Trash2, FileText, Download } from 'lucide-react'
import { uploadProjectAttachment, deleteProjectAttachment } from '@/app/app/projects/[id]/actions'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface Attachment {
  id: string
  file_name: string
  file_path: string
  file_size: number
  uploaded_by: string
  uploaded_at: string
}

interface ProjectAttachmentsProps {
  projectId: string
  attachments: Attachment[]
  canEdit: boolean
  memberMap: Record<string, string>
}

export function ProjectAttachments({
  projectId,
  attachments,
  canEdit,
  memberMap,
}: ProjectAttachmentsProps) {
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await uploadProjectAttachment(projectId, file)
      if (!result.success) {
        alert(`Error: ${result.error}`)
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (filePath: string) => {
    if (!confirm('Delete this file?')) return

    setDeleting(filePath)
    try {
      const result = await deleteProjectAttachment(projectId, filePath)
      if (!result.success) {
        alert(`Error: ${result.error}`)
      }
    } finally {
      setDeleting(null)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  return (
    <div className="space-y-6">
      {/* Upload area */}
      {canEdit && (
        <div>
          <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 py-12 px-6 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
            <Upload size={32} className="text-slate-300" />
            <div className="text-center">
              <p className="font-medium text-slate-700">Drop files here or click to upload</p>
              <p className="text-sm text-slate-500 mt-1">Contracts, drawings, photos, documents, etc.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
              accept="*/*"
            />
          </label>
          {uploading && (
            <p className="text-sm text-slate-500 mt-2">Uploading...</p>
          )}
        </div>
      )}

      {/* Files list */}
      {attachments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Paperclip size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No files attached yet</p>
          {canEdit && (
            <p className="text-sm text-slate-400 mt-1">Upload files to get started</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Attached Files ({attachments.length})</h3>
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileText size={18} className="text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{attachment.file_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatFileSize(attachment.file_size)} • {formatDate(attachment.uploaded_at, 'MMM d, yyyy')} • by {memberMap[attachment.uploaded_by] || 'Unknown'}
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(attachment.file_path)}
                  disabled={deleting === attachment.file_path}
                  className={cn(
                    'ml-3 p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors flex-shrink-0',
                    deleting === attachment.file_path && 'opacity-50 cursor-not-allowed'
                  )}
                  title="Delete file"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
