'use client'

// Lazy drawing thumbnail: only fetches when scrolled into view, so a 50-sheet
// grid never downloads 50 images up front. Object URLs are cached per path.

import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { planFileObjectUrl } from '@/lib/plans/storage'

const urlCache = new Map<string, string>()

export function Thumb({ path, alt, className }: { path: string | null; alt: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(path ? urlCache.get(path) ?? null : null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!path || url) return
    const el = ref.current
    if (!el) return
    let cancelled = false
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      const cached = urlCache.get(path)
      if (cached) { setUrl(cached); return }
      planFileObjectUrl(path)
        .then((u) => {
          if (cancelled) { URL.revokeObjectURL(u); return }
          urlCache.set(path, u)
          setUrl(u)
        })
        .catch(() => { if (!cancelled) setFailed(true) })
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => { cancelled = true; io.disconnect() }
  }, [path, url])

  return (
    <div ref={ref} className={cn('relative bg-white overflow-hidden', className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-slate-300">
          {failed ? <FileText size={20} /> : <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-indigo-400 animate-spin" />}
        </div>
      )}
    </div>
  )
}
