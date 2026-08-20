'use client'

// The "?" in the top bar. Opens a panel explaining the page you are actually
// on, and can pin numbered labels straight onto the page's controls.
//
// The explanations come from src/lib/help/sections.ts, the same data the full
// guide renders, so there is never a second copy to keep in sync.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, HelpCircle, MousePointerClick, X } from 'lucide-react'
import { SECTIONS } from '@/lib/help/sections'
import { helpForPath, type HelpPin } from '@/lib/help/pageHelp'

interface PlacedPin extends HelpPin {
  n: number
  top: number
  left: number
  height: number
}

export function HelpPanel() {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [labelling, setLabelling] = useState(false)
  const [placed, setPlaced] = useState<PlacedPin[]>([])

  const help = useMemo(() => helpForPath(pathname), [pathname])
  const sections = useMemo(
    () => (help ? help.sectionIds.map((id) => SECTIONS.find((s) => s.id === id)).filter((s) => !!s) : []),
    [help],
  )

  // Measure the labelled controls that are actually on screen. Pins whose
  // element is missing (hidden by plan, role, or an empty state) are dropped
  // rather than pointing at nothing.
  const measure = useCallback(() => {
    if (!help?.pins) { setPlaced([]); return }
    let n = 0
    const next: PlacedPin[] = []
    for (const pin of help.pins) {
      const el = document.querySelector<HTMLElement>(`[data-help="${pin.key}"]`)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom < 0 || r.top > window.innerHeight) continue
      next.push({ ...pin, n: ++n, top: r.top, left: r.left, height: r.height })
    }
    setPlaced(next)
  }, [help])

  useEffect(() => {
    // Stale measurements are harmless: nothing reads them while labelling is
    // off, and turning it back on re-measures first.
    if (!labelling) return
    // Measure on the next frame so the panel has finished laying out (and any
    // page reflow it caused has settled) before we read positions.
    let raf = 0
    const rerun = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
    rerun()
    window.addEventListener('resize', rerun)
    window.addEventListener('scroll', rerun, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', rerun)
      window.removeEventListener('scroll', rerun, true)
    }
  }, [labelling, measure])

  // Leaving the page drops the overlay so labels never follow you somewhere
  // they do not belong. Adjusting during render rather than in an effect keeps
  // the stale panel from painting for a frame after a route change.
  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    setLabelling(false)
    setOpen(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLabelling(false); setOpen(false); return }
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      if (!typing && e.key === '?') { e.preventDefault(); setOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hasPins = !!help?.pins?.length

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Help for this page"
        title="Help for this page (?)"
        className={`rounded-lg p-2 transition-all ${open ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
      >
        <HelpCircle size={18} />
      </button>

      {/* Numbered labels pinned onto the real controls */}
      {labelling && (
        <div className="pointer-events-none fixed inset-0 z-[70] print:hidden" aria-hidden="true">
          {placed.map((p) => (
            <div key={p.key} className="absolute" style={{ top: p.top, left: p.left }}>
              <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white shadow-lg ring-2 ring-white">
                {p.n}
              </span>
              <span
                className="absolute left-4 whitespace-nowrap rounded-md bg-slate-900/95 px-2 py-1 text-[11px] font-semibold text-white shadow-lg"
                style={{ top: p.height + 2 }}
              >
                {p.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Labels outlive the panel, so there has to be a way to switch them off
          without reopening it. */}
      {labelling && !open && (
        <div className="fixed bottom-4 left-1/2 z-[73] flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-900 py-1 pl-3 pr-1 shadow-2xl print:hidden">
          <span className="text-[11px] font-semibold text-white">Labels on</span>
          <button onClick={() => setOpen(true)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white">What they mean</button>
          <button onClick={() => setLabelling(false)}
            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-200">Hide</button>
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[71] bg-slate-900/20 print:hidden" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-[72] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl print:hidden dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Help</p>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {help?.title ?? 'Phase Forge'}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close help"
                className="-mr-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              {hasPins && (
                <button
                  onClick={() => setLabelling((l) => !l)}
                  className={`mb-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                    labelling
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'border-slate-200 text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  <MousePointerClick size={15} className="shrink-0" />
                  {labelling ? 'Hide the labels on this page' : 'Label the buttons on this page'}
                </button>
              )}

              {labelling && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  Close this panel to see the labels it is covering. They stay up until you hide them.
                </p>
              )}

              {placed.length > 0 && labelling && (
                <ol className="mb-4 space-y-2">
                  {placed.map((p) => (
                    <li key={p.key} className="flex gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                        {p.n}
                      </span>
                      <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{p.label}</span>
                        {' — '}{p.text}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {sections.length === 0 && (
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  No page notes for this screen yet. The full guide covers everything in the app.
                </p>
              )}

              {sections.map((section) => (
                <div key={section.id} className="mb-5">
                  <div className="mb-2 flex items-center gap-2">
                    <section.icon size={15} className="shrink-0 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{section.title}</h3>
                  </div>
                  <p className="mb-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{section.summary}</p>
                  <dl className="space-y-2">
                    {section.items.map((item) => (
                      <div key={item.heading} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                        <dt className="text-xs font-semibold text-slate-900 dark:text-slate-100">{item.heading}</dt>
                        <dd className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.text}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <Link href="/app/guide" onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                <BookOpen size={15} /> Open the full guide
              </Link>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
