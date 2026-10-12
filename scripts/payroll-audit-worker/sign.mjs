// Request signing for the PhaseForge payroll audit worker. Mirrors
// src/lib/payroll-audit/auth.ts; a unit test keeps the two identical.
import { createHash, createHmac, randomBytes } from 'node:crypto'

export function signRequest(key, { companyId, action, body }) {
  const ts = String(Math.floor(Date.now() / 1000))
  const nonce = randomBytes(16).toString('hex')
  const bodyHash = createHash('sha256').update(body).digest('hex')
  const sig = createHmac('sha256', key).update(`${ts}.${nonce}.${companyId}.${action}.${bodyHash}`).digest('hex')
  return { 'x-pa-ts': ts, 'x-pa-nonce': nonce, 'x-pa-company': companyId, 'x-pa-sig': sig }
}
