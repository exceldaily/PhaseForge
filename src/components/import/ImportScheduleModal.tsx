'use client'
import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, Check, AlertTriangle, Loader2, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DetectedProject } from '@/lib/importParser'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { DEFAULT_PHASE_COLORS } from '@/lib/constants'
import { isMissingUpdatedByColumnError } from '@/lib/projectAudit'
import { cn } from '@/lib/utils'

interface ImportScheduleModalProps {
  open: boolean
  onClose: () => void
  companyId: string
  currentUserId: string
}

type Step = 'upload' | 'confirm' | 'importing' | 'done'

export function ImportScheduleModal({ open, onClose, companyId, currentUserId }: ImportScheduleModalProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [draggingOver, setDraggingOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [fileName, setFileName] = useState('')
  const [detectedProjects, setDetectedProjects] = useState<DetectedProject[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [importError, setImportError] = useState('')
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })

  const reset = () => {
    setStep('upload')
    setDetectedProjects([])
    setParseError('')
    setFileName('')
    setImportError('')
    setParsing(false)
    setExpandedIds(new Set())
  }

  const handleClose = () => { reset(); onClose() }

  const parseFile = async (file: File) => {
    setParsing(true)
    setParseError('')
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      const buffer = await file.arrayBuffer()

      if (ext === 'pdf') {
        const { extractScheduleFromPdf } = await import('@/lib/clientPdfParser')
        const { detectProjects } = await import('@/lib/importParser')
        const { rows, debug } = await extractScheduleFromPdf(buffer)

        if (rows.length === 0) {
          setParseError(
            `Could not extract schedule data.\n\n` +
            `Pages: ${debug.pageCount} | Items: ${debug.totalItems} | Rows found: ${debug.rowsFound}\n\n` +
            `Sample text from page 2:\n${debug.sampleText}\n\n` +
            `Please copy this text and share it, or export the file as Excel (.xlsx) instead.`
          )
          setParsing(false)
          return
        }
        const rawRows: import('@/lib/importParser').RawRow[] = rows.map(r => ({ name: r.name, start: r.start_date, end: r.end_date, indent: r.indent }))
        const detected = detectProjects(rawRows)
        setDetectedProjects(detected)
        setStep('confirm')
      } else {
        // Excel / CSV / Word — send to server API
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/import-schedule', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.error) {
          setParseError(json.error || 'Failed to parse file')
          setParsing(false)
          return
        }
        setDetectedProjects(json.projects as DetectedProject[])
        setStep('confirm')
      }
    } catch (err) {
      console.error(err)
      setParseError('Failed to read file. Please try again.')
    }
    setParsing(false)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [])

  const acceptedProjects = detectedProjects.filter(p => p.accepted)

  const toggleAccepted = (id: string) =>
    setDetectedProjects(prev => prev.map(p => p.id === id ? { ...p, accepted: !p.accepted } : p))

  const acceptAll = () =>
    setDetectedProjects(prev => prev.map(p => ({ ...p, accepted: true })))

  const rejectAll = () =>
    setDetectedProjects(prev => prev.map(p => ({ ...p, accepted: false })))

  const updateName = (id: string, name: string) =>
    setDetectedProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))

  const removePhase = (projectId: string, phaseIdx: number) =>
    setDetectedProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, phases: p.phases.filter((_, i) => i !== phaseIdx) } : p
    ))

  const toggleExpanded = (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  const handleImport = async () => {
    if (acceptedProjects.length === 0) {
      setImportError('Please accept at least one project')
      return
    }
    setStep('importing')
    setImportProgress({ done: 0, total: acceptedProjects.length })
    const supabase = createClient()
    let lastProjectId = ''

    for (const proj of acceptedProjects) {
      let { data: newProject, error: projErr } = await supabase.from('projects').insert({
        name: proj.name,
        company_id: companyId,
        created_by: currentUserId,
        updated_by: currentUserId,
        start_date: proj.start_date,
        end_date: proj.end_date,
        status: 'planning',
        priority: 'medium',
        color: DEFAULT_PHASE_COLORS[detectedProjects.indexOf(proj) % DEFAULT_PHASE_COLORS.length],
      }).select().single()

      if (projErr && isMissingUpdatedByColumnError(projErr)) {
        const retryResult = await supabase.from('projects').insert({
          name: proj.name,
          company_id: companyId,
          created_by: currentUserId,
          start_date: proj.start_date,
          end_date: proj.end_date,
          status: 'planning',
          priority: 'medium',
          color: DEFAULT_PHASE_COLORS[detectedProjects.indexOf(proj) % DEFAULT_PHASE_COLORS.length],
        }).select().single()

        newProject = retryResult.data
        projErr = retryResult.error
      }

      if (projErr || !newProject) continue
      lastProjectId = newProject.id

      if (proj.phases.length > 0) {
        const phases = proj.phases.map((ph, i) => ({
          project_id: newProject.id,
          name: ph.name,
          start_date: ph.start_date,
          end_date: ph.end_date,
          status: 'not_started',
          sort_order: i,
          color: DEFAULT_PHASE_COLORS[i % DEFAULT_PHASE_COLORS.length],
        }))
        await supabase.from('phases').insert(phases)
      }

      setImportProgress(p => ({ ...p, done: p.done + 1 }))
    }

    setStep('done')
    setTimeout(() => {
      handleClose()
      if (acceptedProjects.length === 1 && lastProjectId) {
        router.push(`/app/projects/${lastProjectId}`)
      } else {
        router.push('/app/gantt')
      }
      router.refresh()
    }, 2000)
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Schedule" size="xl">
      {/* ── Step: Upload ── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Upload a project schedule. We&apos;ll automatically detect projects and phases from the hierarchy.
          </p>
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer',
              draggingOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
            )}
            onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
            onDragLeave={() => setDraggingOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            {parsing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={36} className="text-indigo-500 animate-spin" />
                <p className="text-sm font-medium text-slate-700">Reading and detecting projects...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                  <Upload size={28} className="text-indigo-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">Drop your file here or click to browse</p>
                  <p className="text-sm text-slate-400 mt-1">Supports PDF, Excel (.xlsx), CSV, Word (.docx)</p>
                </div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.docx,.txt" className="hidden" onChange={handleFileInput} />
          {parseError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span className="font-medium">Could not read PDF</span>
              </div>
              <pre className="text-xs whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-rose-100 rounded p-2 mt-1">
                {parseError}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Step: Confirm projects ── */}
      {step === 'confirm' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-indigo-600" />
              <span className="text-sm font-medium text-indigo-700">{fileName}</span>
              <span className="text-xs text-slate-400">· {detectedProjects.length} projects detected</span>
            </div>
            <div className="flex gap-2">
              <button onClick={acceptAll} className="text-xs text-indigo-600 font-medium hover:underline">Accept all</button>
              <span className="text-slate-300 text-xs">|</span>
              <button onClick={rejectAll} className="text-xs text-slate-400 hover:text-slate-600 font-medium hover:underline">Deselect all</button>
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex items-center gap-4 px-4 py-2.5 bg-indigo-50 rounded-xl text-sm">
            <span className="font-semibold text-indigo-800">{acceptedProjects.length} of {detectedProjects.length} projects selected</span>
            <span className="text-indigo-500">·</span>
            <span className="text-indigo-600">{acceptedProjects.reduce((sum, p) => sum + p.phases.length, 0)} total phases</span>
          </div>

          {/* Project list */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {detectedProjects.map((proj) => (
              <div
                key={proj.id}
                className={cn(
                  'border rounded-xl overflow-hidden transition-all',
                  proj.accepted ? 'border-indigo-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'
                )}
              >
                {/* Project header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleAccepted(proj.id)}
                    className={cn(
                      'h-5 w-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all',
                      proj.accepted ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                    )}
                  >
                    {proj.accepted && <Check size={12} className="text-white" strokeWidth={3} />}
                  </button>

                  {/* Name (editable) */}
                  <input
                    value={proj.name}
                    onChange={e => updateName(proj.id, e.target.value)}
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-0 focus:outline-none focus:bg-slate-50 rounded px-1 -mx-1"
                  />

                  {/* Dates */}
                  <span className="text-xs text-slate-400 flex-shrink-0 hidden sm:block">
                    {proj.start_date} → {proj.end_date}
                  </span>

                  {/* Phase count + expand */}
                  <button
                    onClick={() => toggleExpanded(proj.id)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 flex-shrink-0"
                  >
                    <span className="font-medium">{proj.phases.length} phases</span>
                    {expandedIds.has(proj.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>

                {/* Expanded phases */}
                {expandedIds.has(proj.id) && (
                  <div className="border-t border-slate-100 max-h-48 overflow-y-auto">
                    {proj.phases.map((ph, i) => (
                      <div key={i} className="flex items-center gap-2 px-4 py-2 border-b border-slate-50 hover:bg-slate-50 group">
                        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0" style={{ marginLeft: ph.indent * 12 }} />
                        <span className="text-xs text-slate-700 flex-1 truncate">{ph.name}</span>
                        <span className="text-xs text-slate-400">{ph.start_date} → {ph.end_date}</span>
                        <button
                          onClick={() => removePhase(proj.id, i)}
                          className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {importError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertTriangle size={15} /> {importError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button onClick={handleImport} className="flex-1">
              Import {acceptedProjects.length} project{acceptedProjects.length !== 1 ? 's' : ''} to Gantt
            </Button>
            <Button variant="secondary" onClick={reset}>Start over</Button>
          </div>
        </div>
      )}

      {/* ── Step: Importing ── */}
      {step === 'importing' && (
        <div className="py-12 text-center space-y-4">
          <Loader2 size={40} className="text-indigo-500 animate-spin mx-auto" />
          <p className="font-semibold text-slate-900">Importing projects...</p>
          <p className="text-slate-500 text-sm">{importProgress.done} of {importProgress.total} complete</p>
          <div className="w-full bg-slate-100 rounded-full h-2 max-w-xs mx-auto">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Step: Done ── */}
      {step === 'done' && (
        <div className="py-10 text-center space-y-3">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <Check size={32} className="text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Import complete!</h3>
          <p className="text-slate-500 text-sm">
            {importProgress.total} project{importProgress.total !== 1 ? 's' : ''} added to your Gantt.
          </p>
          <p className="text-xs text-slate-400">Taking you there now...</p>
        </div>
      )}
    </Modal>
  )
}
