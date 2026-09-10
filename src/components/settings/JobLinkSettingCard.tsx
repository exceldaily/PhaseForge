'use client'

// Settings card for the job link pattern: one address with {job} in it, a
// live preview, and a test link, so a new company can set it up without
// help.

import { useState, useTransition } from 'react'
import { ExternalLink, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buildJobUrl, jobUrlProblem } from '@/lib/jobLink'
import { saveJobLinkTemplate } from '@/app/app/settings/jobLinkActions'

export function JobLinkSettingCard({ template, canEdit, sampleJob }: { template: string | null; canEdit: boolean; sampleJob: string | null }) {
  const [draft, setDraft] = useState(template ?? '')
  const [saved, setSaved] = useState(template ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const problem = jobUrlProblem(draft)
  const example = sampleJob ?? '244621'
  const preview = buildJobUrl(draft, example)

  const save = () => start(async () => {
    setMsg(null); setError(null)
    const res = await saveJobLinkTemplate(draft)
    if ('error' in res) { setError(res.error); return }
    setSaved(draft.trim())
    setMsg(draft.trim() ? 'Saved. Every Job# now opens in your job system.' : 'Links turned off. Job numbers show as plain text.')
  })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6" data-help="settings-job-link">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
          <Link2 size={20} className="text-indigo-600" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Job number link</h2>
          <p className="text-sm text-slate-500">Where a Job# should open: your job tracker, portal, or service system.</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Paste the address of any one job from your system and swap the number for <code className="rounded bg-slate-100 px-1">{'{job}'}</code>.
        After that, the Job# on project cards, project pages, schedules, the copied schedule email, and chat cards all open that job.
        The number itself comes from the <span className="font-medium">Job #</span> field on each project.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!canEdit}
          placeholder="https://yoursystem.com/jobs/{job}"
          className="min-w-[260px] flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-indigo-400 disabled:bg-slate-50" />
        {canEdit && <Button size="sm" onClick={save} disabled={pending || !!problem || draft.trim() === saved}>{pending ? 'Saving' : 'Save'}</Button>}
      </div>
      {problem && draft.trim() && <p className="mt-2 text-xs text-amber-600">{problem}</p>}
      {preview && !problem && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          Job# {example} would open
          <a href={preview} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-mono text-indigo-600 hover:underline">
            {preview} <ExternalLink size={11} />
          </a>
        </p>
      )}
      {!canEdit && <p className="mt-2 text-xs text-slate-400">Managers and up can change this.</p>}
      {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}
      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  )
}
