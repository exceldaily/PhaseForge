// Server-only Google Calendar client. Plain fetch against the REST API — no
// SDK dependency. Tokens are AES-256-GCM encrypted at rest with
// GOOGLE_TOKEN_ENC_KEY and are never sent to the browser.
import 'server-only'
import crypto from 'crypto'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const CAL_API = 'https://www.googleapis.com/calendar/v3'

export const GCAL_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'openid', 'email',
].join(' ')

function encKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY
  if (!raw) throw new Error('GOOGLE_TOKEN_ENC_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_ENC_KEY must be 32 bytes base64')
  return key
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

export function decryptToken(enc: string): string {
  const buf = Buffer.from(enc, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_TOKEN_ENC_KEY
  )
}

export function oauthStartUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GCAL_SCOPES,
    access_type: 'offline',   // get a refresh token
    prompt: 'consent',        // force refresh token even on reconnect
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{
    access_token: string; refresh_token?: string; expires_in: number; id_token?: string
    // Space-delimited list of what the user actually approved, which can be a
    // subset of what was requested.
    scope?: string
  }>
}

export async function refreshAccessToken(refreshTokenEnc: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: decryptToken(refreshTokenEnc),
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

async function calFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (res.status === 204) return null
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Google Calendar ${path}: ${res.status} ${JSON.stringify(body)}`)
  return body
}

export const gcal = {
  listCalendars: (token: string) =>
    calFetch(token, '/users/me/calendarList?minAccessRole=writer'),
  getEvent: (token: string, calId: string, eventId: string) =>
    calFetch(token, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`),
  insertEvent: (token: string, calId: string, body: unknown) =>
    calFetch(token, `/calendars/${encodeURIComponent(calId)}/events`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  patchEvent: (token: string, calId: string, eventId: string, body: unknown) =>
    calFetch(token, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  deleteEvent: (token: string, calId: string, eventId: string) =>
    calFetch(token, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    }),
  // Move an event between calendars (Superintendent reassignment) WITHOUT
  // creating a duplicate — Google's move endpoint preserves the event id.
  moveEvent: (token: string, calId: string, eventId: string, destCalId: string) =>
    calFetch(token, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}/move?destination=${encodeURIComponent(destCalId)}`, {
      method: 'POST',
    }),
}
