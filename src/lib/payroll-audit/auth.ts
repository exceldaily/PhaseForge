import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Request signing between the local worker and PhaseForge.
//
// The worker never holds a password or a session token for PhaseForge, only a
// per-company key derived from a master secret that lives in server env vars.
// Every request carries a timestamp, a one-time nonce, and an HMAC over those,
// the company, the action, and a hash of the body, so a captured request
// cannot be altered, re-aimed at another action, or replayed.
//
// scripts/payroll-audit-worker/sign.mjs implements the same scheme; a test
// pins the two together.

export const SIGNATURE_WINDOW_SECONDS = 300

export function deriveWorkerKey(master: string, companyId: string, version: number): string {
  return createHmac('sha256', master).update(`payroll-audit-worker:${companyId}:${version}`).digest('hex')
}

export function signString(p: { ts: string; nonce: string; companyId: string; action: string; body: string }): string {
  const bodyHash = createHash('sha256').update(p.body).digest('hex')
  return `${p.ts}.${p.nonce}.${p.companyId}.${p.action}.${bodyHash}`
}

export function sign(key: string, p: { ts: string; nonce: string; companyId: string; action: string; body: string }): string {
  return createHmac('sha256', key).update(signString(p)).digest('hex')
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'bad_timestamp' | 'expired' | 'bad_nonce' | 'bad_signature' }

export function verify(
  key: string,
  p: { ts: string; nonce: string; companyId: string; action: string; body: string; sig: string },
  nowMs = Date.now(),
): VerifyResult {
  const ts = Number(p.ts)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' }
  if (Math.abs(nowMs / 1000 - ts) > SIGNATURE_WINDOW_SECONDS) return { ok: false, reason: 'expired' }
  if (!/^[a-f0-9]{16,64}$/i.test(p.nonce)) return { ok: false, reason: 'bad_nonce' }
  const want = Buffer.from(sign(key, p), 'hex')
  let got: Buffer
  try { got = Buffer.from(p.sig, 'hex') } catch { return { ok: false, reason: 'bad_signature' } }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: 'bad_signature' }
  return { ok: true }
}
