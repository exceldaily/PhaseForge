'use client'

// Chat's own alerts, kept apart from the main bell: @ pings plus job activity
// (card moves, punch items, plans, change orders). Opening a space clears the
// alerts that point at it, so this list is only what you have not seen yet.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AtSign, CheckCheck, MessagesSquare, Settings2, Zap } from 'lucide-react'
import { listChatAlerts, readChatAlerts, setChatAlertPref, type ChatAlert } from '@/app/app/chat/actions'
import { CHAT_ALERT_PREFS, type ChatAlertPref } from '@/lib/chat/systemEvents'

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function ChatAlerts() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const [alerts, setAlerts] = useState<ChatAlert[]>([])
  const [total, setTotal] = useState(0)
  const [pref, setPref] = useState<ChatAlertPref>('all')
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const load = useCallback(async () => {
    const res = await listChatAlerts()
    setAlerts(res.alerts)
    setTotal(res.total)
    setPref(res.pref)
  }, [])

  // On every route change (reading a space clears its alerts), and once a
  // minute while the tab is visible.
  useEffect(() => {
    let alive = true
    const tick = () => { if (alive && document.visibilityState === 'visible') void load() }
    tick()
    const id = setInterval(tick, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [load, pathname])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSettings(false) } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const dismiss = (id: string) => {
    setAlerts((cur) => cur.filter((a) => a.id !== id))
    setTotal((n) => Math.max(0, n - 1))
    void readChatAlerts({ id })
  }
  const dismissAll = () => {
    setAlerts([])
    setTotal(0)
    void readChatAlerts({})
  }
  const pick = (next: ChatAlertPref) => {
    const before = pref
    setPref(next)
    void setChatAlertPref({ pref: next }).then((r) => { if (!r.ok) setPref(before) })
  }

  return (
    <div ref={ref} className="relative" data-help="chat-alerts">
      <button onClick={() => { setOpen((o) => !o); if (!open) void load() }} aria-label="Chat alerts" title="Chat alerts"
        className="relative rounded-lg p-2 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300">
        <MessagesSquare size={18} />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Chat alerts</span>
            {total > 0 && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">{total}</span>}
            <span className="ml-auto flex items-center gap-2">
              {alerts.length > 0 && (
                <button onClick={dismissAll} className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  <CheckCheck size={12} /> Clear all
                </button>
              )}
              <button onClick={() => setSettings((s) => !s)} aria-label="Alert settings" aria-pressed={settings} title="What alerts me"
                className={`rounded p-1 ${settings ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40' : 'text-slate-400 hover:text-slate-600'}`}>
                <Settings2 size={14} />
              </button>
            </span>
          </div>

          {settings && (
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Job activity alerts</p>
              <div className="space-y-1">
                {CHAT_ALERT_PREFS.map((p) => (
                  <label key={p.value} className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <input type="radio" name="chat-alert-pref" checked={pref === p.value} onChange={() => pick(p.value)} className="mt-0.5 h-3.5 w-3.5 text-indigo-600" />
                    <span>
                      <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{p.label}</span>
                      <span className="block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{p.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 && (
              <div className="px-4 py-10 text-center">
                <MessagesSquare size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nothing new in chat</p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Pings and job activity show up here.</p>
              </div>
            )}
            {alerts.map((a) => (
              <div key={a.id} className="group flex items-start gap-3 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50">
                <div className="mt-0.5 shrink-0">
                  {a.type === 'mention' ? <AtSign size={13} className="text-indigo-500" /> : <Zap size={13} className="text-amber-500" />}
                </div>
                <Link href={a.link ?? '/app/chat'} onClick={() => { dismiss(a.id); setOpen(false) }} className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{a.title}</p>
                  {a.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{a.body}</p>}
                  <p className="mt-0.5 text-[10px] text-slate-400">{ago(a.createdAt)}</p>
                </Link>
                <button onClick={() => dismiss(a.id)} aria-label="Dismiss"
                  className="shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-slate-500 group-hover:opacity-100 pointer-coarse:opacity-100 dark:text-slate-600">✕</button>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700">
            <Link href="/app/chat" onClick={() => setOpen(false)} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Open Chat</Link>
          </div>
        </div>
      )}
    </div>
  )
}
