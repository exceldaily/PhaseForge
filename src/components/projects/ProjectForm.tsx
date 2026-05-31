'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DEFAULT_PHASE_COLORS } from '@/lib/constants'
import { isMissingUpdatedByColumnError } from '@/lib/projectAudit'
import { Project } from '@/types/app'

interface Member { id: string; full_name: string; email: string; role: string }

interface ProjectFormProps {
  companyId: string
  members: Member[]
  currentUserId: string
  project?: Project
}

const PERMIT_STATUSES = [
  { value: 'not_required', label: 'Not Required' },
  { value: 'pending', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
]

export function ProjectForm({ companyId, members, currentUserId, project }: ProjectFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newSub, setNewSub] = useState('')
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
  })

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const addSub = () => {
    if (!newSub.trim()) return
    setForm(f => ({ ...f, subcontractors: [...f.subcontractors, newSub.trim()] }))
    setNewSub('')
  }

  const removeSub = (i: number) =>
    setForm(f => ({ ...f, subcontractors: f.subcontractors.filter((_, idx) => idx !== i) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()

    if (project) {
      const updatedAt = new Date().toISOString()
      let { error } = await supabase
        .from('projects')
        .update({ ...form, updated_at: updatedAt, updated_by: currentUserId })
        .eq('id', project.id)

      if (error && isMissingUpdatedByColumnError(error)) {
        ;({ error } = await supabase
          .from('projects')
          .update({ ...form, updated_at: updatedAt })
          .eq('id', project.id))
      }

      if (error) { setError(error.message); setLoading(false); return }
      router.push(`/app/projects/${project.id}`)
    } else {
      let { data, error } = await supabase.from('projects').insert({
        ...form, company_id: companyId, created_by: currentUserId, updated_by: currentUserId,
      }).select().single()

      if (error && isMissingUpdatedByColumnError(error)) {
        ;({ data, error } = await supabase.from('projects').insert({
          ...form, company_id: companyId, created_by: currentUserId,
        }).select().single())
      }

      if (error) { setError(error.message); setLoading(false); return }
      router.push(`/app/projects/${data.id}`)
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
          <Input id="customer_name" label="Client / Customer" placeholder="ABC Corp" value={form.customer_name} onChange={set('customer_name')} />
          <Input id="job_location" label="Job location" placeholder="123 Main St, City, State" value={form.job_location} onChange={set('job_location')} />
          <Input id="start_date" type="date" label="Start date *" value={form.start_date} onChange={set('start_date')} required />
          <Input id="end_date" type="date" label="End date *" value={form.end_date} onChange={set('end_date')} required />
        </div>
      </section>

      {/* Team */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Team</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Select id="project_manager" label="Project Manager" value={form.project_manager} onChange={set('project_manager')}>
            <option value="">— Select PM —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
          <Input id="superintendent" label="Superintendent" placeholder="Name or company" value={form.superintendent} onChange={set('superintendent')} />
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

      {/* Status & Priority */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Status</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <Select id="status" label="Project Stage" value={form.status} onChange={set('status')}>
            <option value="mobilization">Mobilization</option>
            <option value="construction_initiated">Construction Initiated</option>
            <option value="pct_30">30% Constructed</option>
            <option value="pct_60">60% Constructed</option>
            <option value="pct_90">90% Constructed</option>
            <option value="final_punchlist">Final Punchlist</option>
            <option value="closeout">Closeout</option>
            <option value="closed">Closed</option>
          </Select>
          <Select id="priority" label="Priority" value={form.priority} onChange={set('priority')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
          <Select id="permit_status" label="Permit Status" value={form.permit_status} onChange={set('permit_status')}>
            {PERMIT_STATUSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
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
      </section>

      {error && <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>{project ? 'Save changes' : 'Create project'}</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}
