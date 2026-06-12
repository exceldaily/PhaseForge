'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, ExternalLink, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { deleteProjectAttachment, uploadProjectAttachment } from '@/app/app/projects/[id]/actions'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ProjectAttachment } from '@/types/app'

interface ProjectAttachmentsProps {
  projectId: string
  attachments: ProjectAttachment[]
  canEdit: boolean
  memberMap: Record<string, string>
}

export function ProjectAttachments({
  projectId,
  attachments,
  canEdit,
  memberMap,
}: ProjectAttachmentsProps) {
  const router = useRouter()
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
      } else {
        router.refresh()
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
      } else {
        router.refresh()
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
      {canEdit && (
        <div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 transition-colors hover:border-indigo-300 hover:bg-indigo-50">
            <Upload size={32} className="text-slate-300" />
            <div className="text-center">
              <p className="font-medium text-slate-700">Drop files here or click to upload</p>
              <p className="mt-1 text-sm text-slate-500">Contracts, drawings, photos, documents, etc.</p>
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
          {uploading && <p className="mt-2 text-sm text-slate-500">Uploading...</p>}
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Paperclip size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No files attached yet</p>
          {canEdit && <p className="mt-1 text-sm text-slate-400">Upload files to get started</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Attached Files ({attachments.length})
          </h3>
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <FileText size={18} className="flex-shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  {attachment.signed_url ? (
                    <a
                      href={attachment.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                    >
                      {attachment.file_name}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-medium text-slate-900">
                      {attachment.file_name}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatFileSize(attachment.file_size)} • {formatDate(attachment.uploaded_at, 'MMM d, yyyy')} • by{' '}
                    {memberMap[attachment.uploaded_by] || 'Unknown'}
                  </p>
                </div>
              </div>

              <div className="ml-3 flex flex-shrink-0 items-center gap-1.5">
                {attachment.signed_url && (
                  <>
                    <a
                      href={attachment.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      title="View file"
                    >
                      <ExternalLink size={16} />
                    </a>
                    <a
                      href={attachment.signed_url}
                      download={attachment.file_name}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      title="Download file"
                    >
                      <Download size={16} />
                    </a>
                  </>
                )}

                {canEdit && (
                  <button
                    onClick={() => handleDelete(attachment.file_path)}
                    disabled={deleting === attachment.file_path}
                    className={cn(
                      'rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600',
                      deleting === attachment.file_path && 'cursor-not-allowed opacity-50'
                    )}
                    title="Delete file"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
