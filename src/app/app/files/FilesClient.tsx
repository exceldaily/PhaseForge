'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Download, FileText, Image as ImageIcon, File as FileIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { FilterBar, useUrlFilters, type FilterDef } from '@/components/operations/FilterBar'
import { OpsPageHeader, EmptyState, timeAgo } from '@/components/operations/shared'
import type { OrgFile } from '@/lib/operations/types'

interface Option { id: string; name: string }
interface ProfileLite { id: string; full_name: string }

const RECORD_TYPES = ['customer', 'location', 'asset', 'call', 'project', 'vendor', 'invoice']

function fileKind(mime: string | null): 'image' | 'doc' | 'other' {
  if (!mime) return 'other'
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text') || mime.includes('sheet')) return 'doc'
  return 'other'
}

function formatBytes(n: number | null): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export function FilesClient({
  files, customers, profiles, companyId, canWrite,
}: {
  files: OrgFile[]
  customers: Option[]
  profiles: ProfileLite[]
  companyId: string
  canWrite: boolean
}) {
  const router = useRouter()
  const [filters, setFilters] = useUrlFilters()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileName = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles])
  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])

  const q = (filters.q ?? '').toLowerCase()
  const filtered = files.filter((f) => {
    if (q && !f.file_name.toLowerCase().includes(q)) return false
    if (filters.kind && fileKind(f.mime_type) !== filters.kind) return false
    if (filters.record_type === 'library' ? f.record_type !== null : (filters.record_type && f.record_type !== filters.record_type)) return false
    if (filters.customer && f.customer_id !== filters.customer) return false
    if (filters.uploader && f.uploaded_by !== filters.uploader) return false
    if (filters.uploaded_from && f.created_at.slice(0, 10) < filters.uploaded_from) return false
    if (filters.uploaded_to && f.created_at.slice(0, 10) > filters.uploaded_to) return false
    return true
  })

  const defs: FilterDef[] = [
    { key: 'kind', label: 'Type', type: 'select', options: [
      { value: 'image', label: 'Images' }, { value: 'doc', label: 'Documents' }, { value: 'other', label: 'Other' }] },
    { key: 'record_type', label: 'Linked to', type: 'select', options: [
      { value: 'library', label: 'Company library' },
      ...RECORD_TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))] },
    { key: 'customer', label: 'Customer', type: 'select', options: customers.map((c) => ({ value: c.id, label: c.name })) },
    { key: 'uploader', label: 'Uploader', type: 'select', options: profiles.map((p) => ({ value: p.id, label: p.full_name })) },
    { key: 'uploaded', label: 'Uploaded', type: 'daterange' },
  ]

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return
    setUploading(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    for (const file of Array.from(fileList)) {
      const path = `${companyId}/library/${crypto.randomUUID()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('org-files').upload(path, file)
      if (upErr) { setError(upErr.message); continue }
      await supabase.from('org_files').insert({
        company_id: companyId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user?.id ?? null,
      })
    }
    setUploading(false)
    router.refresh()
  }

  async function download(f: OrgFile) {
    const supabase = createClient()
    const { data, error: sigErr } = await supabase.storage.from('org-files').createSignedUrl(f.storage_path, 300)
    if (sigErr || !data?.signedUrl) { setError(sigErr?.message ?? 'Could not create download link'); return }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div>
      <OpsPageHeader
        title="Files"
        subtitle="Company library plus files attached to customers, calls, projects, and more"
        actions={canWrite && (
          <>
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
            <Button size="sm" onClick={() => inputRef.current?.click()} loading={uploading}>
              <Upload size={14} /> Upload
            </Button>
          </>
        )}
      />
      {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <FilterBar defs={defs} filters={filters} onChange={setFilters} searchPlaceholder="Search files…" />

      {filtered.length === 0 ? (
        <EmptyState
          title={files.length ? 'No files match the current filters.' : 'No files yet.'}
          hint={files.length ? undefined : 'Upload company documents here, or attach files to records across the platform.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                <th className="px-4 py-2.5">File</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Linked To</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Customer</th>
                <th className="px-4 py-2.5">Size</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Uploaded</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const kind = fileKind(f.mime_type)
                const Icon = kind === 'image' ? ImageIcon : kind === 'doc' ? FileText : FileIcon
                return (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                        <Icon size={15} className="shrink-0 text-slate-400" />
                        <span className="max-w-xs truncate">{f.file_name}</span>
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 capitalize text-slate-500 md:table-cell">{f.record_type ?? 'Library'}</td>
                    <td className="hidden px-4 py-2.5 text-slate-500 md:table-cell">{f.customer_id ? customerName.get(f.customer_id) ?? '—' : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatBytes(f.size_bytes)}</td>
                    <td className="hidden px-4 py-2.5 text-slate-400 lg:table-cell">
                      {f.uploaded_by ? profileName.get(f.uploaded_by) ?? '—' : '—'} · {timeAgo(f.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => download(f)} title="Download" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800">
                        <Download size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
