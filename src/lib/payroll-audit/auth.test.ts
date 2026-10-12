import { describe, expect, it } from 'vitest'
import { deriveWorkerKey, verify } from './auth'
import { signRequest } from '../../../scripts/payroll-audit-worker/sign.mjs'

const KEY = deriveWorkerKey('master-secret', 'company-1', 1)

function signed(body: string, action = 'submit') {
  const h = signRequest(KEY, { companyId: 'company-1', action, body })
  return { ts: h['x-pa-ts'], nonce: h['x-pa-nonce'], sig: h['x-pa-sig'], companyId: 'company-1', action, body }
}

describe('worker request signing', () => {
  it('accepts what the worker script signs', () => {
    expect(verify(KEY, signed('{"a":1}'))).toEqual({ ok: true })
  })
  it('rejects an altered body', () => {
    expect(verify(KEY, { ...signed('{"a":1}'), body: '{"a":2}' })).toEqual({ ok: false, reason: 'bad_signature' })
  })
  it('rejects a signature reused for another action', () => {
    expect(verify(KEY, { ...signed('{}', 'poll'), action: 'complete' })).toEqual({ ok: false, reason: 'bad_signature' })
  })
  it('rejects another company or a rotated key', () => {
    const s = signed('{}')
    expect(verify(KEY, { ...s, companyId: 'company-2' })).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verify(deriveWorkerKey('master-secret', 'company-1', 2), s)).toEqual({ ok: false, reason: 'bad_signature' })
  })
  it('rejects an old timestamp', () => {
    const s = signed('{}')
    expect(verify(KEY, s, Date.now() + 10 * 60_000)).toEqual({ ok: false, reason: 'expired' })
  })
  it('derives different keys per company and version', () => {
    expect(deriveWorkerKey('m', 'a', 1)).not.toBe(deriveWorkerKey('m', 'b', 1))
    expect(deriveWorkerKey('m', 'a', 1)).not.toBe(deriveWorkerKey('m', 'a', 2))
  })
})
