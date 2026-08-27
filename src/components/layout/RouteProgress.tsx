'use client'

// A slim progress bar across the top of the app during navigation.
//
// The App Router has no global navigation events, so this listens for clicks
// on same-origin links (capture phase, before Next handles them) and starts
// the bar; the pathname/search change from the completed navigation finishes
// it. Trickle animation is time-based and capped below 90% so it never lies
// about being done — the real completion snaps it to 100 and fades.
//
// The loading.tsx skeletons cover the body of the page; this covers the gap
// where the click has happened but nothing has visibly changed yet, and
// slow same-route transitions (filters, tabs via querystring) that never
// swap the segment.

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function RouteProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)     // 0 = hidden
  const [fading, setFading] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const active = useRef(false)

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  useEffect(() => {
    const start = (event: MouseEvent) => {
      // New tab / download / modified clicks are not navigations here.
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      let url: URL
      try { url = new URL(anchor.href) } catch { return }
      if (url.origin !== window.location.origin) return
      // Same page (hash-only or identical) never round-trips.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      active.current = true
      setFading(false)
      setProgress(12)
      stopTimer()
      // Ease toward 85%: fast at first, slowing, never claiming completion.
      timer.current = setInterval(() => {
        setProgress((p) => (p >= 85 ? p : p + Math.max(0.5, (85 - p) * 0.06)))
      }, 120)
    }

    document.addEventListener('click', start, true)
    return () => {
      document.removeEventListener('click', start, true)
      stopTimer()
    }
  }, [])

  // Navigation landed: snap to done and fade out.
  useEffect(() => {
    if (!active.current) return
    active.current = false
    stopTimer()
    setProgress(100)
    const t1 = setTimeout(() => setFading(true), 80)
    const t2 = setTimeout(() => { setProgress(0); setFading(false) }, 480)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [pathname, searchParams])

  if (progress === 0) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 print:hidden"
      style={{ opacity: fading ? 0 : 1, transition: 'opacity 250ms ease' }}
    >
      <div
        className="h-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.6)]"
        style={{ width: `${progress}%`, transition: 'width 150ms ease-out' }}
      />
    </div>
  )
}
