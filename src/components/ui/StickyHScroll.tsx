'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Horizontally-scrolling region (e.g. a kanban board) whose scrollbar is
 * detached from the content and pinned to the bottom of the viewport.
 *
 * The page still scrolls vertically as normal — cards move with the page —
 * but the horizontal scrollbar stays reachable at the bottom of the screen
 * instead of sitting at the bottom of tall content below the fold.
 *
 * Pass the page-scroll sizing (e.g. minHeight) via `style`; it lands on the
 * inner scroller so the page keeps growing/scrolling with the content.
 */
export function StickyHScroll({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const proxyRef = useRef<HTMLDivElement>(null)
  const lockRef = useRef<'content' | 'proxy' | null>(null)
  const [contentWidth, setContentWidth] = useState(0)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return

    const measure = () => {
      setContentWidth(content.scrollWidth)
      setOverflowing(content.scrollWidth > scroller.clientWidth + 1)
    }
    measure()

    // Re-measure when the column set or the viewport width changes.
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  // Mirror scroll between the real content and the proxy bar without looping.
  const handleContentScroll = () => {
    if (lockRef.current === 'proxy') return
    lockRef.current = 'content'
    if (proxyRef.current && scrollRef.current) {
      proxyRef.current.scrollLeft = scrollRef.current.scrollLeft
    }
    requestAnimationFrame(() => {
      lockRef.current = null
    })
  }

  const handleProxyScroll = () => {
    if (lockRef.current === 'content') return
    lockRef.current = 'proxy'
    if (scrollRef.current && proxyRef.current) {
      scrollRef.current.scrollLeft = proxyRef.current.scrollLeft
    }
    requestAnimationFrame(() => {
      lockRef.current = null
    })
  }

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleContentScroll}
        // Native horizontal scrollbar hidden — the sticky proxy below is the
        // visible one. Wheel/trackpad horizontal scrolling still works.
        className={cn('overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
        style={style}
      >
        <div ref={contentRef} className="flex w-max min-w-full gap-5">
          {children}
        </div>
      </div>

      {overflowing && (
        <div
          ref={proxyRef}
          onScroll={handleProxyScroll}
          className="sticky bottom-0 z-30 overflow-x-auto border-t border-slate-200 bg-white/85 backdrop-blur [scrollbar-width:thin]"
          style={{ height: 16 }}
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      )}
    </>
  )
}
