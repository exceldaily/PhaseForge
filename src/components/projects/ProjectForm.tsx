'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { safeExternalUrl } from '@/lib/utils'
import { checkProjectLimit } from '@/lib/planLimits'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DEFAULT_PHASE_COLORS } from '@/lib/constants'
import { isMissingLinksColumnError, isMissingShowPunchColumnError, isMissingUpdatedByColumnError } from '@/lib/projectAudit'
import { updateProject, updateProjectBoard } from '@/app/app/projects/[id]/actions'
import { Project, ProjectLink } from '@/types/app'

interface Member { id: string; full_name: string; email: string; role: string }
interface BoardColumn { id: string; name: string; sort_order: number; color: string }
interface Board { id: string; name: string; board_columns?: BoardColumn[] }

interface ProjectFormProps {
  companyId: string
  members: Member[]
  currentUserId: string
  project?: Project
  boards?: Board[]
  // v2 board context (when creating from a board)
  defaultBoardId?: string
  defaultColumnId?: string
  boardColumns?: BoardColumn[]
  boardVisibleFields?: string[]
  boardCustomStages?: string[]
}

const PERMIT_STATUSES = [
  { value: 'not_required', label: 'Not Required' },
  { value: 'pending', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
]

const DEFAULT_STAGES = [
  'queue', 'mobilization', 'construction_initiated', 'pct_30', 'pct_60', 'pct_90', 'final_punchlist', 'closeout', 'closed'
]

export function ProjectForm({ companyId, members, currentUserId, project, boards = [], defaultBoardId, defaultColumnId, boardColumns = [], boardVisibleFields = [], boardCustomStages = [] }: ProjectFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newSub, setNewSub] = useState('')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(project?.board_id || defaultBoardId || null)
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(project?.board_column_id || defaultColumnId || null)
  const [form, setForm] = useState({
    name: project?.name || '',
    customer_name: project?.customer_name || '',
    job_location: project?.job_location || '',
    start_date: project?.start_date || new Date().toISOString().split('T')[0],
    end_date: project?.end_date || '',
    project_manager: project?.project_manager || currentUserId,
    superintendent: project?.superintendent || '',
    subcontractors: project?.subcontractors || [],
    permit_status: project?.permit_status || 'not_required',
    status: project?.status || 'mobilization',
    priority: project?.priority || 'medium',
    notes: project?.notes || '',
    color: project?.color || DEFAULT_PHASE_COLORS[0],
    links: (project?.links || []) as ProjectLink[],
    show_punch_on_card: project?.show_punch_on_card ?? true,
  })

  const selectedBoard = boards.find(b => b.id === selectedBoardId)
  const columnOptions = selectedBoard?.board_columns || []

  // Check if board customization is active
  const hasCustomization = boardVisibleFields && boardVisibleFields.length > 0
  const shouldShowField = (fieldId: string) => !hasCustomization || boardVisibleFields.includes(fieldId)
  const stages = boardCustomStages && boardCustomStages.length > 0 ? boardCustomStages : DEFAULT_STAGES

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const addSub = () => {
    if (!newSub.trim()) return
    setForm(f => ({ ...f, subcontractors: [...f.subcontractors, newSub.trim()] }))
    setNewSub('')
  }

  const removeSub = (i: number) =>
    setForm(f => ({ ...f, subcontractors: f.subcontractors.filter((_, idx) => idx !== i) }))

  const addLink = () => {
    const url = safeExternalUrl(newLinkUrl)
    if (!url) {
      setError('Enter a valid web address, e.g. https://example.com')
      return
    }
    let label = newLinkLabel.trim()
    if (!label) {
      try { label = new URL(url).hostname.replace(/^www\./, '') } catch { label = url }
    }
    setForm(f => ({ ...f, links: [...(f.links || []), { label, url }] }))
    setNewLinkLabel('')
    setNewLinkUrl('')
    setError('')
  }

  const removeLink = (i: number) =>
    setForm(f => ({ ...f, links: (f.links || []).filter((_, idx) => idx !== i) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side date validation
    if (!form.end_date) {
      setError('End date is required.')
      return
    }
    if (form.start_date > form.end_date) {
      setError('Start date must be on or before the end date.')
      return
    }

    setLoading(true)

    // Plan limit check (create only)
    if (!project) {
      const usage = await checkProjectLimit(companyId)
      if (!usage.allowed) {
        setError(usage.reason ?? 'Project limit reached.')
        setLoading(false)
        return
      }
    }

    const supabase = createClient()

    if (project) {
      // Update project with activity logging
      const updateResult = await updateProject(project.id, form)
      if (!updateResult.success) {
        setError(updateResult.error || 'Failed to update project')
        setLoading(false)
        return
      }

      // Update board assignment if changed
      if (selectedBoardId || selectedColumnId) {
        await updateProjectBoard(project.id, selectedBoardId, selectedColumnId)
      }

      router.push(`/app/projects/${project.id}`)
    } else {
      const boardFields = selectedBoardId || defaultBoardId
        ? { board_id: selectedBoardId || defaultBoardId, board_column_id: selectedColumnId || defaultColumnId || null }
        : {}

      let { data, error } = await supabase.from('projects').insert({
        ...form, ...boardFields, company_id: companyId, created_by: currentUserId, updated_by: currentUserId,
      }).select().single()

      if (error && isMissingUpdatedByColumnError(error)) {
        ;({ data, error } = await supabase.from('projects').insert({
          ...form, ...boardFields, company_id: companyId, created_by: currentUserId,
        }).select().single())
      }

      // Graceful fallback if the links column hasn't been migrated yet.
      if (error && isMissingLinksColumnError(error)) {
        const formNoLinks = { ...form } as Record<string, unknown>
        delete formNoLinks.links
        ;({ data, error } = await supabase.from('projects').insert({
          ...formNoLinks, ...boardFields, company_id: companyId, created_by: currentUserId, updated_by: currentUserId,
        }).select().single())
        if (error && isMissingUpdatedByColumnError(error)) {
          ;({ data, error } = await supabase.from('projects').insert({
            ...formNoLinks, ...boardFields, company_id: companyId, created_by: currentUserId,
          }).select().single())
        }
      }

      // Graceful fallback if the show_punch_on_card column hasn't been migrated yet.
      if (error && isMissingShowPunchColumnError(error)) {
        const formNoPunch = { ...form } as Record<string, unknown>
        delete formNoPunch.show_punch_on_card
        ;({ data, error } = await supabase.from('projects').insert({
          ...formNoPunch, ...boardFields, company_id: companyId, created_by: currentUserId, updated_by: currentUserId,
        }).select().single())
        if (error && isMissingUpdatedByColumnError(error)) {
          ;({ data, error } = await supabase.from('projects').insert({
            ...formNoPunch, ...boardFields, company_id: companyId, created_by: currentUserId,
          }).select().single())
        }
      }

      if (error) { setError(error.message); setLoading(false); return }
      // Return to the board if we came from one
      const boardRedirect = selectedBoardId || defaultBoardId
      router.push(boardRedirect ? `/app/boards/${boardRedirect}` : `/app/projects/${data.id}`)
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">

      {/* Basic Info */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Project Info</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input id="name" label="Project name *" placeholder="Downtown Office Renovation" value={form.name} onChange={set('name')} required />
          </div>
          {shouldShowField('client_name') && (
          <Input id="customer_name" label="Client / Customer" placeholder="ABC Corp" value={form.customer_name} onChange={set('customer_name')} />
          )}
          {shouldShowField('job_location') && (
          <Input id="job_location" label="Job location" placeholder="123 Main St, City, State" value={form.job_location} onChange={set('job_location')} />
          )}
          <Input id="start_date" type="date" label="Start date *" value={form.start_date} onChange={set('start_date')} required />
          <Input id="end_date" type="date" label="End date *" value={form.end_date} onChange={set('end_date')} required />
        </div>
      </section>

      {/* Board / Workspace */}
      {boards.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Workspace</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Board</label>
              <select
                value={selectedBoardId || ''}
                onChange={(e) => {
                  setSelectedBoardId(e.target.value || null)
                  setSelectedColumnId(null) // Reset column when board changes
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No board</option>
                {boards.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            {selectedBoard && columnOptions.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Column</label>
                <select
                  value={selectedColumnId || ''}
                  onChange={(e) => setSelectedColumnId(e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Auto (first column)</option>
                  {columnOptions.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Team */}
      {(shouldShowField('project_manager') || shouldShowField('superintendent') || shouldShowField('subcontractors')) && (
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Team</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Project Manager</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  list="pm-suggestions"
                  value={form.project_manager}
                  onChange={set('project_manager')}
                  placeholder="Type or select PM..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="pm-suggestions">
                  {members.map(m => <option key={m.id} value={m.full_name} />)}
                </datalist>
              </div>
              {form.project_manager && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, project_manager: '' }))}
                  className="px-3 py-2 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Superintendent</label>
            <div className="flex gap-2">
              <input
                value={form.superintendent}
                onChange={set('superintendent')}
                placeholder="Name or company"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {form.superintendent && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, superintendent: '' }))}
                  className="px-3 py-2 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Subcontractors */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1.5">Subcontractors</label>
          <div className="flex gap-2 mb-2">
            <input
              value={newSub}
              onChange={e => setNewSub(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub() } }}
              placeholder="Add subcontractor name..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addSub}><Plus size={14} /> Add</Button>
          </div>
          {form.subcontractors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.subcontractors.map((sub, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-3 py-1.5 text-sm text-slate-700">
                  {sub}
                  <button type="button" onClick={() => removeSub(i)} className="text-slate-400 hover:text-slate-700 ml-1">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      )}

      {/* Status & Priority */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Status</h3>
        <div className={`grid gap-4 ${shouldShowField('permit_status') ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <Select id="status" label="Project Stage" value={form.status} onChange={set('status')}>
            {stages.map(stage => (
              <option key={stage} value={stage}>
                {stage.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </option>
            ))}
          </Select>
          <Select id="priority" label="Priority" value={form.priority} onChange={set('priority')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
          {shouldShowField('permit_status') && (
          <Select id="permit_status" label="Permit Status" value={form.permit_status} onChange={set('permit_status')}>
            {PERMIT_STATUSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
          )}
        </div>
      </section>

      {/* Color & Notes */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Details</h3>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Project color</label>
          <div className="flex gap-2 flex-wrap">
            {DEFAULT_PHASE_COLORS.map(color => (
              <button key={color} type="button" onClick={() => setForm(f => ({ ...f, color }))}
                className="h-7 w-7 rounded-full transition-all border-2"
                style={{ backgroundColor: color, borderColor: form.color === color ? '#0f172a' : 'transparent' }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Any additional notes..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.show_punch_on_card}
            onChange={(e) => setForm(f => ({ ...f, show_punch_on_card: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm">
            <span className="font-medium text-slate-700">Show a Punch List button on this project&apos;s card</span>
            <span className="block text-xs text-slate-400">Adds a quick link with open / done counts to the board card.</span>
          </span>
        </label>
      </section>

      {/* Links */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Links</h3>
          <p className="mt-1 text-xs text-slate-400">Quick links to plan sets, store info, permit portals, spec sheets — anything you want one tap away.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newLinkLabel}
            onChange={e => setNewLinkLabel(e.target.value)}
            placeholder="Label (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-44"
          />
          <input
            value={newLinkUrl}
            onChange={e => setNewLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
            placeholder="https://example.com"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <Button type="button" variant="secondary" size="sm" onClick={addLink}><Plus size={14} /> Add</Button>
        </div>
        {form.links.length > 0 && (
          <div className="space-y-2">
            {form.links.map((l, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <Link2 size={14} className="flex-shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{l.label}</p>
                  <p className="truncate text-xs text-slate-400">{l.url}</p>
                </div>
                <button type="button" onClick={() => removeLink(i)} className="text-slate-400 transition-colors hover:text-rose-500">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>{project ? 'Save changes' : 'Create project'}</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}
