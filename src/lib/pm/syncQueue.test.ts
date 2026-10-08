import { describe, expect, it } from 'vitest'
import { applyResults, enqueue, markSending, networkFailed, opKey, resolveConflict, restore, summarize, toSend, type Queue, type SyncOp } from './syncQueue'

const resp = (itemId: string, patch: object, baseRev: number | null = null): SyncOp => ({ kind: 'response', itemId, patch, baseRev })
const reading = (col: string, value: string): SyncOp => ({ kind: 'reading', table: 'electrical', row: 'd:1', col, value })

describe('the autosave queue', () => {
  it('merges repeated taps on one check into a single save', () => {
    let q: Queue = {}
    q = enqueue(q, resp('COND1', { result: 'pass' }, 3), 1)
    q = enqueue(q, resp('COND1', { result: 'fail' }, 3), 2)
    q = enqueue(q, resp('COND1', { note: 'Fan 2 noisy' }, 9), 3)
    expect(Object.keys(q)).toEqual(['r:COND1'])
    expect(q['r:COND1']).toEqual({ op: { kind: 'response', itemId: 'COND1', patch: { result: 'fail', note: 'Fan 2 noisy' }, baseRev: 3, force: undefined }, seq: 3, state: 'pending' })
  })
  it('keeps different things apart and sends oldest first', () => {
    let q: Queue = {}
    q = enqueue(q, reading('l1_a', '14.2'), 5)
    q = enqueue(q, resp('COND2', { result: 'pass' }), 2)
    q = enqueue(q, { kind: 'pm', patch: { techNotes: 'A' } }, 7)
    q = enqueue(q, { kind: 'pm', patch: { timeIn: '7:10' } }, 8)
    q = enqueue(q, reading('l1_a', '14.3'), 9)
    expect(toSend(q).map((s) => s.key)).toEqual(['r:COND2', 'pm', 'v:electrical|d:1|l1_a'])
    expect(q.pm.op).toEqual({ kind: 'pm', patch: { techNotes: 'A', timeIn: '7:10' } })
    expect((q['v:electrical|d:1|l1_a'].op as { value: string }).value).toBe('14.3')
    expect(opKey(reading('fla', '1'))).toBe('v:electrical|d:1|fla')
  })
  it('only lets go of an entry once the server has it', () => {
    let q = enqueue({}, resp('COND1', { result: 'pass' }), 1)
    const sent = toSend(q)
    q = markSending(q, sent.map((s) => s.key))
    expect(q['r:COND1'].state).toBe('sending')
    expect(toSend(q)).toEqual([])
    q = applyResults(q, sent, [{ key: 'r:COND1', status: 'ok', rev: 1 }])
    expect(q).toEqual({})
  })
  it('loses nothing when the request never comes back', () => {
    let q = enqueue({}, resp('COND1', { result: 'pass' }), 1)
    q = enqueue(q, reading('fla', '21.8'), 2)
    const sent = toSend(q)
    q = networkFailed(markSending(q, sent.map((s) => s.key)), sent.map((s) => s.key))
    expect(toSend(q)).toHaveLength(2)
    expect(summarize(q, 0, false)).toMatchObject({ state: 'offline', waiting: 2, label: 'Offline. 2 entries kept on this phone' })
  })
  it('keeps an edit made while the previous save was in flight', () => {
    let q = enqueue({}, resp('COND1', { result: 'pass' }, null), 1)
    const sent = toSend(q)
    q = markSending(q, ['r:COND1'])
    q = enqueue(q, resp('COND1', { note: 'Added after' }, null), 2)
    q = applyResults(q, sent, [{ key: 'r:COND1', status: 'ok', rev: 1 }])
    // Still queued, and now sitting on the rev the server just handed back.
    expect(q['r:COND1']).toMatchObject({ state: 'pending', seq: 2, op: { baseRev: 1, patch: { result: 'pass', note: 'Added after' } } })
  })
  it('marks failures and conflicts instead of dropping them', () => {
    let q = enqueue({}, resp('COND1', { result: 'pass' }, 2), 1)
    q = enqueue(q, resp('COND2', { result: 'na' }, null), 2)
    const sent = toSend(q)
    const server = { itemId: 'COND1', result: 'fail' as const, measureValue: null, note: 'Bent fin', naReason: null, inspectedBy: 'u2', inspectedAt: '2026-10-08T12:00:00Z', rev: 4 }
    q = applyResults(markSending(q, sent.map((s) => s.key)), sent, [
      { key: 'r:COND1', status: 'conflict', server, error: 'Changed by Alex' },
      { key: 'r:COND2', status: 'error', error: 'Say why it does not apply' },
    ])
    expect(q['r:COND1']).toMatchObject({ state: 'conflict', server })
    expect(q['r:COND2']).toMatchObject({ state: 'failed', error: 'Say why it does not apply' })
    // Failed entries retry; conflicts wait for a person.
    expect(toSend(q).map((s) => s.key)).toEqual(['r:COND2'])
    expect(summarize(q, 0, true)).toMatchObject({ state: 'conflict', conflicts: 1, failed: 1 })
  })
  it('resolves a conflict either way', () => {
    const server = { itemId: 'COND1', result: 'fail' as const, measureValue: null, note: null, naReason: null, inspectedBy: 'u2', inspectedAt: null, rev: 4 }
    const q: Queue = { 'r:COND1': { op: resp('COND1', { result: 'pass' }, 2), seq: 1, state: 'conflict', server } }
    expect(resolveConflict(q, 'r:COND1', 'theirs', 9)).toEqual({})
    expect(resolveConflict(q, 'r:COND1', 'mine', 9)['r:COND1']).toEqual({ op: { kind: 'response', itemId: 'COND1', patch: { result: 'pass' }, baseRev: 4, force: true }, seq: 9, state: 'pending' })
  })
  it('comes back from a reload with nothing stuck mid-flight', () => {
    const saved = JSON.parse(JSON.stringify({ 'r:COND1': { op: resp('COND1', { result: 'pass' }), seq: 1, state: 'sending' }, junk: null, pm: { op: { kind: 'pm', patch: {} }, seq: 2, state: 'failed', error: 'x' } }))
    const q = restore(saved)
    expect(q['r:COND1'].state).toBe('pending')
    expect(q.pm.state).toBe('failed')
    expect(q.junk).toBeUndefined()
    expect(restore(null)).toEqual({})
    expect(restore('nope')).toEqual({})
  })
  it('tells the technician plainly whether entries are safe', () => {
    expect(summarize({}, 0, true)).toEqual({ state: 'saved', waiting: 0, failed: 0, conflicts: 0, label: 'All entries saved' })
    const one = enqueue({}, resp('COND1', { result: 'pass' }), 1)
    expect(summarize(one, 0, true).label).toBe('Saving 1 entry')
    expect(summarize(one, 2, true)).toMatchObject({ state: 'saving', waiting: 3, label: 'Saving 3 entries' })
    expect(summarize({}, 0, false).label).toBe('Offline. Entries are kept on this phone')
    expect(summarize(one, 0, false)).toMatchObject({ state: 'offline', waiting: 1 })
  })
})
