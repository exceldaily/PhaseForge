'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { LifeBuoy, Mail, Play, Search, X } from 'lucide-react'
import { WelcomeTour } from '@/components/onboarding/WelcomeTour'

// Section copy lives in src/lib/help/sections.ts so the Help panel in the top
// bar can show the same text scoped to whatever page you are on.
import { SECTIONS, type GuideSection } from '@/lib/help/sections'

export function GuideClient() {
  const [query, setQuery] = useState('')
  const [tourOpen, setTourOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return SECTIONS
    return SECTIONS.map((section) => {
      const sectionMatches =
        section.title.toLowerCase().includes(q) || section.summary.toLowerCase().includes(q)
      const items = section.items.filter(
        (item) => item.heading.toLowerCase().includes(q) || item.text.toLowerCase().includes(q)
      )
      if (sectionMatches) return section
      if (items.length > 0) return { ...section, items }
      return null
    }).filter((s): s is GuideSection => s !== null)
  }, [q])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <WelcomeTour open={tourOpen} onClose={() => setTourOpen(false)} />

      {/* Hero */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Phase Forge Guide</h1>
            <p className="mt-2 max-w-xl text-sm text-indigo-100">
              Everything in the app, explained — from your first board to filtered reports.
              New here? The welcome tour covers the big picture in about a minute.
            </p>
          </div>
          <button
            onClick={() => setTourOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
          >
            <Play size={15} /> Take the tour
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide... (e.g. import, roles, milestones)"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Quick nav */}
      {!q && (
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-600"
            >
              {section.title}
            </a>
          ))}
        </div>
      )}

      {/* Sections */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
          Nothing in the guide matches &quot;{query}&quot;.
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map(({ id, icon: Icon, title, summary, href, hrefLabel, items }) => (
            <section key={id} id={id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{summary}</p>
                  </div>
                </div>
                {href && hrefLabel && (
                  <Link href={href} className="text-xs font-medium text-indigo-600 hover:underline">
                    {hrefLabel} →
                  </Link>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <div key={item.heading} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">{item.heading}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Support */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
              <LifeBuoy size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Still need a hand?</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Can&apos;t find your answer here? Our support team is happy to help.
              </p>
            </div>
          </div>
          <a
            href="mailto:customersupport@phase-forge.com"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Mail size={15} /> customersupport@phase-forge.com
          </a>
        </div>
      </div>
    </div>
  )
}
