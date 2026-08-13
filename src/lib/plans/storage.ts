'use client'

// Storage access for plan files. Everything goes through the user's own
// session (RLS-enforced, no raw public URLs): browser-direct uploads keep
// large plan sets out of server actions, downloads return blobs the viewer
// feeds straight to pdfjs. A small in-memory LRU keeps sheet switching and
// adjacent-sheet preloading instant without holding a whole set in RAM.

import { createClient } from '@/lib/supabase/client'

export const PLANS_BUCKET = 'project-attachments'

export function revisionPdfPath(projectId: string, sheetId: string, revisionId: string) {
  return `plans/${projectId}/${sheetId}/${revisionId}/sheet.pdf`
}
export function revisionThumbPath(projectId: string, sheetId: string, revisionId: string) {
  return `plans/${projectId}/${sheetId}/${revisionId}/thumb.webp`
}

export async function uploadPlanFile(path: string, data: Blob | Uint8Array, contentType: string) {
  const supabase = createClient()
  const body = data instanceof Blob ? data : new Blob([data as BlobPart], { type: contentType })
  const { error } = await supabase.storage.from(PLANS_BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  })
  if (error && !/already exists/i.test(error.message)) {
    const mb = (body.size / (1024 * 1024)).toFixed(1)
    const friendly = /exceed|too large|payload|maximum allowed size/i.test(error.message)
      ? `This file is ${mb}MB — too large for the storage per-file limit.`
      : error.message
    throw new Error(`Upload failed for ${path.split('/').pop()}: ${friendly}`)
  }
}

// ── In-memory LRU for downloaded files ──────────────────────────────────────
const CACHE_MAX_BYTES = 120 * 1024 * 1024 // ~120MB of sheets/thumbnails in RAM, tops
const cache = new Map<string, ArrayBuffer>()
let cacheBytes = 0
const inflight = new Map<string, Promise<ArrayBuffer>>()

function cachePut(path: string, buf: ArrayBuffer) {
  if (buf.byteLength > CACHE_MAX_BYTES / 4) return // never let one file dominate
  cache.set(path, buf)
  cacheBytes += buf.byteLength
  while (cacheBytes > CACHE_MAX_BYTES && cache.size > 1) {
    const oldest = cache.keys().next().value as string
    cacheBytes -= cache.get(oldest)!.byteLength
    cache.delete(oldest)
  }
}

/** Offline cache name — sheets marked "Available offline" live here via Cache API. */
const OFFLINE_CACHE = 'pf-plans-offline-v1'

export async function downloadPlanFile(path: string): Promise<ArrayBuffer> {
  const hit = cache.get(path)
  if (hit) {
    // refresh LRU position
    cache.delete(path); cache.set(path, hit)
    return hit
  }
  const pending = inflight.get(path)
  if (pending) return pending

  const p = (async () => {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from(PLANS_BUCKET).download(path)
    if (error || !data) {
      // Network down? Fall back to the offline cache before giving up.
      const offline = await readOffline(path)
      if (offline) return offline
      throw new Error(error?.message ?? 'Download failed')
    }
    const buf = await data.arrayBuffer()
    cachePut(path, buf)
    return buf
  })().finally(() => inflight.delete(path))
  inflight.set(path, p)
  return p
}

/** Fire-and-forget preload (adjacent sheets) — errors are intentionally ignored. */
export function preloadPlanFile(path: string) {
  downloadPlanFile(path).catch(() => {})
}

export async function planFileObjectUrl(path: string): Promise<string> {
  const buf = await downloadPlanFile(path)
  return URL.createObjectURL(new Blob([buf], { type: path.endsWith('.webp') ? 'image/webp' : 'application/pdf' }))
}

// ── Offline (Cache API) ─────────────────────────────────────────────────────
// Real, scoped offline support: selected sheets are stored locally and served
// when the network fails. Markup/comment offline sync is intentionally NOT
// claimed or implemented here — that needs conflict handling and comes later.

function offlineKey(path: string) {
  return `https://plans.local/${path}`
}

export function offlineSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window
}

export async function saveOffline(path: string): Promise<void> {
  if (!offlineSupported()) throw new Error('Offline storage is not supported in this browser')
  const buf = await downloadPlanFile(path)
  const c = await caches.open(OFFLINE_CACHE)
  await c.put(offlineKey(path), new Response(buf, { headers: { 'Content-Type': 'application/pdf' } }))
}

export async function removeOffline(path: string): Promise<void> {
  if (!offlineSupported()) return
  const c = await caches.open(OFFLINE_CACHE)
  await c.delete(offlineKey(path))
}

export async function isOffline(path: string): Promise<boolean> {
  if (!offlineSupported()) return false
  const c = await caches.open(OFFLINE_CACHE)
  return !!(await c.match(offlineKey(path)))
}

async function readOffline(path: string): Promise<ArrayBuffer | null> {
  if (!offlineSupported()) return null
  try {
    const c = await caches.open(OFFLINE_CACHE)
    const res = await c.match(offlineKey(path))
    return res ? await res.arrayBuffer() : null
  } catch { return null }
}
