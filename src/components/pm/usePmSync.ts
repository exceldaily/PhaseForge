'use client'

// Drives the autosave queue for one PM: saves a moment after each change,
// keeps everything on the phone while there is no signal, retries on its
// own, and reports one honest status line. The queue rules themselves are in
// src/lib/pm/syncQueue.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { syncPm, uploadPmFiles, type SyncReply } from '@/app/app/pm/checklistActions'
import { shrinkImage } from '@/lib/chat/shrinkImage'
import { listPhotos, putPhoto, removePhoto, type QueuedPhoto } from '@/lib/pm/photoQueue'
import {
  applyResults, enqueue, markSending, networkFailed, resolveConflict, restore, summarize, toSend,
  type Queue, type SyncOp,
} from '@/lib/pm/syncQueue'
import type { PmAttachment } from '@/lib/pm/types'

export interface PendingPhoto { id: string; itemId: string | null; deficiencyId: string | null; name: string; url: string; state: 'waiting' | 'uploading' | 'failed'; error?: string }
type Counts = NonNullable<SyncReply['counts']>

const SAVE_AFTER_MS = 700
const RETRY_MS = 8000

function readQueue(key: string): Queue {
  try { return restore(JSON.parse(localStorage.getItem(key) ?? 'null')) } catch { return {} }
}

export function usePmSync(pmId: string, handlers: {
  onReply: (reply: SyncReply) => void
  onUploaded: (attachments: PmAttachment[], counts: Counts | null) => void
}) {
  const storageKey = `pf-pm-queue:${pmId}`
  const [queue, setQueueState] = useState<Queue>(() => readQueue(storageKey))
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const queueRef = useRef<Queue>(queue)
  const seq = useRef(Object.values(queue).reduce((m, e) => Math.max(m, e.seq), 0))
  const sending = useRef(false)
  const uploading = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blobs = useRef(new Map<string, QueuedPhoto>())
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers })

  const setQueue = useCallback((next: Queue) => {
    queueRef.current = next
    setQueueState(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* storage full or blocked: still held in memory */ }
  }, [storageKey])

  // The save loop reschedules itself, so it goes through a ref.
  const flushRef = useRef<() => void>(() => {})
  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), ms)
  }, [])

  const flush = useCallback(async () => {
    if (sending.current) return
    const batch = toSend(queueRef.current)
    if (!batch.length) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setOnline(false); return }
    sending.current = true
    const keys = batch.map((b) => b.key)
    setQueue(markSending(queueRef.current, keys))
    try {
      const reply = await syncPm({ pmId, ops: batch.map((b) => ({ key: b.key, op: b.op })) })
      setOnline(true)
      if (reply.ok) {
        setQueue(applyResults(queueRef.current, batch, reply.results))
        handlersRef.current.onReply(reply)
      } else {
        // The server answered, and said no to the whole batch (not assigned, closed out).
        setQueue(applyResults(queueRef.current, batch, keys.map((key) => ({ key, status: 'error' as const, error: reply.error }))))
      }
    } catch {
      // No answer at all: the phone is offline or the request died on the way.
      setQueue(networkFailed(queueRef.current, keys))
      setOnline(typeof navigator === 'undefined' ? false : navigator.onLine)
      schedule(RETRY_MS)
    } finally {
      sending.current = false
    }
    // Anything added while that request was out goes next.
    if (toSend(queueRef.current).some((b) => queueRef.current[b.key].state === 'pending')) schedule(SAVE_AFTER_MS)
  }, [pmId, setQueue, schedule])
  useEffect(() => { flushRef.current = () => { void flush() } }, [flush])

  const push = useCallback((op: SyncOp) => {
    seq.current += 1
    setQueue(enqueue(queueRef.current, op, seq.current))
    schedule(SAVE_AFTER_MS)
  }, [schedule, setQueue])

  /* ── Photos ── */
  const uploadNext = useCallback(async () => {
    if (uploading.current) return
    uploading.current = true
    // One at a time, oldest first, until the list is empty or the signal drops.
    for (;;) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break
      const next = [...blobs.current.values()].sort((a, b) => a.createdAt - b.createdAt)[0]
      if (!next) break
      setPhotos((cur) => cur.map((p) => (p.id === next.id ? { ...p, state: 'uploading', error: undefined } : p)))
      try {
        const form = new FormData()
        form.set('pmId', next.pmId)
        if (next.itemId) form.set('itemId', next.itemId)
        if (next.deficiencyId) form.set('deficiencyId', next.deficiencyId)
        form.append('files', new File([next.blob], next.name, { type: next.type }))
        const res = await uploadPmFiles(form)
        if (res.ok) {
          blobs.current.delete(next.id)
          await removePhoto(next.id)
          setPhotos((cur) => { const gone = cur.find((p) => p.id === next.id); if (gone) URL.revokeObjectURL(gone.url); return cur.filter((p) => p.id !== next.id) })
          handlersRef.current.onUploaded(res.attachments, res.counts)
        } else {
          // Refused, not lost: it stays on the phone with the reason until removed.
          blobs.current.delete(next.id)
          setPhotos((cur) => cur.map((p) => (p.id === next.id ? { ...p, state: 'failed', error: res.error } : p)))
        }
      } catch {
        setPhotos((cur) => cur.map((p) => (p.id === next.id ? { ...p, state: 'waiting' } : p)))
        break
      }
    }
    uploading.current = false
  }, [])

  const addPhotos = useCallback(async (files: File[], target: { itemId?: string | null; deficiencyId?: string | null }) => {
    for (const raw of files) {
      const file = await shrinkImage(raw)
      const queued: QueuedPhoto = {
        id: crypto.randomUUID(), pmId, itemId: target.itemId ?? null, deficiencyId: target.deficiencyId ?? null,
        name: file.name, type: file.type || 'image/jpeg', blob: file, createdAt: Date.now(),
      }
      blobs.current.set(queued.id, queued)
      await putPhoto(queued)
      setPhotos((cur) => [...cur, { id: queued.id, itemId: queued.itemId, deficiencyId: queued.deficiencyId, name: queued.name, url: URL.createObjectURL(file), state: 'waiting' }])
    }
    void uploadNext()
  }, [pmId, uploadNext])

  const dropPhoto = useCallback(async (id: string) => {
    blobs.current.delete(id)
    await removePhoto(id)
    setPhotos((cur) => { const gone = cur.find((p) => p.id === id); if (gone) URL.revokeObjectURL(gone.url); return cur.filter((p) => p.id !== id) })
  }, [])

  // Pick up anything left over from last time: unsent entries and photos.
  useEffect(() => {
    let alive = true
    void listPhotos(pmId).then((stored) => {
      if (!alive || !stored.length) return
      for (const p of stored) blobs.current.set(p.id, p)
      setPhotos(stored.map((p) => ({ id: p.id, itemId: p.itemId, deficiencyId: p.deficiencyId, name: p.name, url: URL.createObjectURL(p.blob), state: 'waiting' as const })))
      void uploadNext()
    })
    const first = setTimeout(() => { void flush() }, 300)
    return () => { alive = false; clearTimeout(first) }
  }, [pmId, flush, uploadNext])

  // Come back online, or come back to the tab: try again straight away.
  useEffect(() => {
    const up = () => { setOnline(true); void flush(); void uploadNext() }
    const down = () => setOnline(false)
    const seen = () => { if (document.visibilityState === 'visible') { void flush(); void uploadNext() } }
    const tick = setInterval(() => { void flush(); void uploadNext() }, 20000)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    document.addEventListener('visibilitychange', seen)
    return () => { clearInterval(tick); window.removeEventListener('online', up); window.removeEventListener('offline', down); document.removeEventListener('visibilitychange', seen) }
  }, [flush, uploadNext])

  const summary = useMemo(() => summarize(queue, photos.filter((p) => p.state !== 'failed').length, online), [queue, photos, online])

  // Leaving with unsent entries: they are safe on this phone, but say so.
  useEffect(() => {
    if (summary.state === 'saved') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [summary.state])

  const retry = useCallback(() => { void flush(); void uploadNext() }, [flush, uploadNext])
  const resolve = useCallback((key: string, keep: 'mine' | 'theirs') => {
    seq.current += 1
    setQueue(resolveConflict(queueRef.current, key, keep, seq.current))
    void flush()
  }, [flush, setQueue])
  const discard = useCallback((key: string) => {
    const next = { ...queueRef.current }
    delete next[key]
    setQueue(next)
  }, [setQueue])

  return { queue, online, summary, photos, push, addPhotos, dropPhoto, retry, resolve, discard }
}
