'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, BookOpen, FolderKanban,
  GanttChartSquare, Layers, LayoutDashboard, Rocket, UsersRound, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SEEN_KEY = 'phaseforge_welcome_tour_seen'

const STEPS = [
  {
    icon: Rocket,
    title: 'Welcome to Phase Forge',
    body: "Phase Forge keeps construction and project work on schedule — boards for organizing projects, phases for tracking the work, and a Gantt timeline that ties it all together. This quick tour shows you where everything lives. It takes about a minute.",
  },
  {
    icon: Layers,
    title: 'Boards organize your projects',
    body: "A board is a workspace for a group of projects — by division, client, or however you work. Each board has its own columns (Queue, Mobilization, In Progress...) and can customize which fields show on project forms. Restrict a board to specific teams and only those members can see it and its projects.",
  },
  {
    icon: FolderKanban,
    title: 'Projects and phases',
    body: "Projects hold the details: client, location, dates, PM, permit status, priority. Inside each project, phases break the job into scheduled chunks of work that you can assign to people or trades. Create projects one at a time, or use Import Schedule to pull a whole Excel workbook in at once — each tab becomes a project with its phases.",
  },
  {
    icon: GanttChartSquare,
    title: 'The Gantt timeline',
    body: "Every project and phase appears on the Gantt chart. Drag bars to move work, drag edges to resize, and zoom from day to month view. Changes save automatically and show up for everyone on the team.",
  },
  {
    icon: LayoutDashboard,
    title: 'Dashboard and the board filter',
    body: "The Dashboard is your morning briefing: active projects, what's at risk, tasks starting this week, team capacity, and recent activity. Use the Board dropdown — on the Dashboard, Gantt, Projects, Analytics, Reports, and Resources — to focus any page on a single board instead of everything at once.",
  },
  {
    icon: UsersRound,
    title: 'Teams, invites, and roles',
    body: "Invite teammates by email from Settings — they get a link to set their password and land right in your workspace. Roles control what people can do: owners and admins manage everything, managers run boards and projects, members work on what's assigned, and viewers can only look.",
  },
  {
    icon: BookOpen,
    title: "You're all set",
    body: "That's the lay of the land. The Guide page in the sidebar has a deeper walkthrough of every feature whenever you need it — and you can replay this tour from there too.",
  },
]

interface WelcomeTourProps {
  open: boolean
  onClose: () => void
}

export function WelcomeTour({ open, onClose }: WelcomeTourProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  if (!open) return null

  const { icon: Icon, title, body } = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close tour"
        >
          <X size={18} />
        </button>

        <div className="mb-5 inline-flex rounded-2xl bg-indigo-50 p-4 text-indigo-600">
          <Icon size={28} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>

        {/* Progress dots */}
        <div className="mt-6 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-6 bg-indigo-600' : 'w-1.5 bg-slate-200 hover:bg-slate-300'
              )}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button onClick={onClose} className="text-sm font-medium text-slate-400 hover:text-slate-600">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={15} /> Back
              </button>
            )}
            {isLast ? (
              <Link
                href="/app/guide"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <BookOpen size={15} /> Open the Guide
              </Link>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Next <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Auto-opens the welcome tour once per browser for first-time users. */
export function FirstRunTour() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(SEEN_KEY)) setOpen(true)
  }, [])

  const close = () => {
    localStorage.setItem(SEEN_KEY, new Date().toISOString())
    setOpen(false)
  }

  return <WelcomeTour open={open} onClose={close} />
}
