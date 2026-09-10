'use client'

// The company's job link pattern, available to every client component under
// the app shell, so a Job# anywhere can open the job without each page
// fetching the setting itself.

import { createContext, useCallback, useContext } from 'react'
import { ExternalLink } from 'lucide-react'
import { buildJobUrl } from '@/lib/jobLink'
import { cn } from '@/lib/utils'

const JobLinkContext = createContext<string | null>(null)

export function JobLinkProvider({ template, children }: { template: string | null; children: React.ReactNode }) {
  return <JobLinkContext.Provider value={template}>{children}</JobLinkContext.Provider>
}

/** A function turning a job number into its link (null when none is set up). */
export function useJobLink(): (jobNumber: string | null | undefined) => string | null {
  const template = useContext(JobLinkContext)
  return useCallback((jobNumber) => buildJobUrl(template, jobNumber), [template])
}

/**
 * "Job# 244621" as a tag. Opens the job in the company's system in a new tab
 * when a link pattern is set; plain text otherwise. Clicking it never opens
 * the card or row it sits on.
 */
export function JobNumberTag({ value, className, size = 'sm' }: { value: string; className?: string; size?: 'sm' | 'md' }) {
  const link = useJobLink()(value)
  const cls = cn(
    'inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 font-bold tabular-nums text-indigo-700',
    size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]',
    className,
  )
  if (!link) return <span title="Job number" className={cls}>Job# {value}</span>
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" data-card-action="true"
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      title="Open this job in your job system"
      className={cn(cls, 'hover:border-indigo-400 hover:bg-indigo-100')}>
      Job# {value} <ExternalLink size={size === 'md' ? 11 : 9} />
    </a>
  )
}
