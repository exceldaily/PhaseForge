// Autosave for the technician's checklist, as plain data.
//
// Every tap becomes an op in a queue. The queue is saved to the phone, so a
// dropped connection, a closed tab, or a dead battery does not lose it. Ops
// for the same thing merge (ten taps on one check are one save). An op only
// leaves the queue when the server says it has it.
//
// Pure functions: the hook that drives this just stores the result.

import type { CheckResult, PmResponse } from './types'

export interface ResponsePatch { result?: CheckResult | null; measureValue?: string | null; note?: string | null; naReason?: string | null }
export interface PmPatch {
  techNotes?: string | null; timeIn?: string | null; timeOut?: string | null; serviceProvider?: string | null
  returnVisitNeeded?: boolean; returnVisitNote?: string | null; fmSpotChecked?: boolean | null; lastItemId?: string | null
}

export type SyncOp =
  | { kind: 'response'; itemId: string; patch: ResponsePatch; baseRev: number | null; force?: boolean }
  | { kind: 'reading'; table: string; row: string; col: string; value: string }
  | { kind: 'pm'; patch: PmPatch }

export const opKey = (op: SyncOp): string =>
  op.kind === 'response' ? `r:${op.itemId}` : op.kind === 'reading' ? `v:${op.table}|${op.row}|${op.col}` : 'pm'

export type EntryState = 'pending' | 'sending' | 'failed' | 'conflict'
export interface QueueEntry {
  op: SyncOp
  /** Bumped on every change, so a reply for an older version of the op does not clear a newer one. */
  seq: number
  state: EntryState
  error?: string
  /** On a conflict: what the server has. */
  server?: PmResponse
}
export type Queue = Record<string, QueueEntry>

export interface SyncResult {
  key: string
  status: 'ok' | 'conflict' | 'error'
  rev?: number
  server?: PmResponse
  error?: string
}

/** Add an op, merging it into one already waiting for the same thing. */
export function enqueue(queue: Queue, op: SyncOp, seq: number): Queue {
  const key = opKey(op)
  const prev = queue[key]
  let merged: SyncOp = op
  if (prev && prev.op.kind === 'response' && op.kind === 'response') {
    // Keep the rev the phone last saw from the server, not the newer guess.
    merged = { ...op, patch: { ...prev.op.patch, ...op.patch }, baseRev: prev.op.baseRev, force: op.force || prev.op.force }
  } else if (prev && prev.op.kind === 'pm' && op.kind === 'pm') {
    merged = { kind: 'pm', patch: { ...prev.op.patch, ...op.patch } }
  }
  return { ...queue, [key]: { op: merged, seq, state: 'pending' } }
}

/** What to send now: everything waiting, oldest first. Conflicts wait for a person. */
export function toSend(queue: Queue): { key: string; seq: number; op: SyncOp }[] {
  return Object.entries(queue)
    .filter(([, e]) => e.state === 'pending' || e.state === 'failed')
    .sort((a, b) => a[1].seq - b[1].seq)
    .map(([key, e]) => ({ key, seq: e.seq, op: e.op }))
}

export function markSending(queue: Queue, keys: string[]): Queue {
  const next = { ...queue }
  for (const k of keys) if (next[k]) next[k] = { ...next[k], state: 'sending', error: undefined }
  return next
}

/** Fold the server's reply back in. */
export function applyResults(queue: Queue, sent: { key: string; seq: number }[], results: SyncResult[]): Queue {
  const next = { ...queue }
  const sentSeq = new Map(sent.map((s) => [s.key, s.seq]))
  for (const r of results) {
    const entry = next[r.key]
    if (!entry) continue
    const changedSince = entry.seq !== sentSeq.get(r.key)
    if (r.status === 'ok') {
      if (!changedSince) { delete next[r.key]; continue }
      // Edited again while that save was in flight: keep it, on top of the new rev.
      const op = entry.op.kind === 'response' && r.rev !== undefined ? { ...entry.op, baseRev: r.rev } : entry.op
      next[r.key] = { ...entry, op, state: 'pending' }
    } else if (r.status === 'conflict') {
      next[r.key] = { ...entry, state: 'conflict', server: r.server, error: r.error }
    } else {
      next[r.key] = { ...entry, state: 'failed', error: r.error ?? 'Could not save' }
    }
  }
  return next
}

/** The request never got an answer (no signal). Nothing is lost: it all goes back to waiting. */
export function networkFailed(queue: Queue, keys: string[]): Queue {
  const next = { ...queue }
  for (const k of keys) if (next[k]?.state === 'sending') next[k] = { ...next[k], state: 'pending' }
  return next
}

/** After a reload, anything that was mid-flight is treated as not sent. */
export function restore(saved: unknown): Queue {
  if (!saved || typeof saved !== 'object') return {}
  const out: Queue = {}
  for (const [k, v] of Object.entries(saved as Record<string, QueueEntry>)) {
    if (!v || typeof v !== 'object' || !v.op) continue
    out[k] = { ...v, state: v.state === 'sending' ? 'pending' : v.state }
  }
  return out
}

/** Resolve a conflict: keep mine (send again on top of theirs) or take theirs (drop mine). */
export function resolveConflict(queue: Queue, key: string, keep: 'mine' | 'theirs', seq: number): Queue {
  const entry = queue[key]
  if (!entry) return queue
  const next = { ...queue }
  if (keep === 'theirs' || entry.op.kind !== 'response') { delete next[key]; return next }
  next[key] = { op: { ...entry.op, baseRev: entry.server?.rev ?? entry.op.baseRev, force: true }, seq, state: 'pending' }
  return next
}

export type SyncState = 'saved' | 'saving' | 'offline' | 'failed' | 'conflict'
export interface SyncSummary { state: SyncState; waiting: number; failed: number; conflicts: number; label: string }

/** The one line the technician sees: are my entries safe? */
export function summarize(queue: Queue, pendingPhotos: number, online: boolean): SyncSummary {
  const entries = Object.values(queue)
  const failed = entries.filter((e) => e.state === 'failed').length
  const conflicts = entries.filter((e) => e.state === 'conflict').length
  const waiting = entries.filter((e) => e.state === 'pending' || e.state === 'sending').length + pendingPhotos
  const n = (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`
  if (conflicts) return { state: 'conflict', waiting, failed, conflicts, label: `${n(conflicts)} changed by someone else` }
  if (failed) return { state: 'failed', waiting, failed, conflicts, label: `${n(failed)} did not save` }
  if (!online && waiting) return { state: 'offline', waiting, failed, conflicts, label: `Offline. ${n(waiting)} kept on this phone` }
  if (!online) return { state: 'offline', waiting, failed, conflicts, label: 'Offline. Entries are kept on this phone' }
  if (waiting) return { state: 'saving', waiting, failed, conflicts, label: `Saving ${n(waiting)}` }
  return { state: 'saved', waiting: 0, failed: 0, conflicts: 0, label: 'All entries saved' }
}
