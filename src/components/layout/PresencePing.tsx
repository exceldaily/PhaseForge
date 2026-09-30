'use client'

// The heartbeat behind "last active". It only counts real use: a ping goes
// out when the person has clicked, typed, or scrolled since the last one and
// the tab is in front, and never more than once every four minutes across
// all their tabs. A tab left open on a desk overnight does not count.

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { touchPresence } from '@/app/app/presenceActions'

const EVERY_MS = 4 * 60 * 1000
const KEY = 'pf-last-ping'

export function PresencePing() {
  const pathname = usePathname()
  const path = useRef(pathname)
  const used = useRef(true)   // opening the app is use

  useEffect(() => { path.current = pathname; used.current = true }, [pathname])

  useEffect(() => {
    const touched = () => { used.current = true }
    const ping = () => {
      if (!used.current || document.visibilityState !== 'visible') return
      const now = Date.now()
      let last = 0
      try { last = Number(localStorage.getItem(KEY) ?? 0) } catch { /* private mode */ }
      if (now - last < EVERY_MS) return
      try { localStorage.setItem(KEY, String(now)) } catch { /* private mode */ }
      used.current = false
      void touchPresence(path.current)
    }
    ping()
    const id = setInterval(ping, 60000)
    const opts = { passive: true } as const
    window.addEventListener('pointerdown', touched, opts)
    window.addEventListener('keydown', touched, opts)
    window.addEventListener('scroll', touched, { passive: true, capture: true })
    document.addEventListener('visibilitychange', ping)
    return () => {
      clearInterval(id)
      window.removeEventListener('pointerdown', touched)
      window.removeEventListener('keydown', touched)
      window.removeEventListener('scroll', touched, { capture: true })
      document.removeEventListener('visibilitychange', ping)
    }
  }, [])

  return null
}
