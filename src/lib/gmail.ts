/**
 * Thin Gmail REST API wrapper.
 * Uses fetch + URL-safe base64 decode — no googleapis package needed.
 */

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface GmailLabel {
  id: string
  name: string
  type?: string
}

export interface GmailMessageRef {
  id: string
  threadId: string
}

export interface GmailMessagePart {
  mimeType: string
  headers?: Array<{ name: string; value: string }>
  body?: { size: number; data?: string }
  parts?: GmailMessagePart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  internalDate: string
  payload: GmailMessagePart
}

export interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

// ── Token management ────────────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed ${res.status}: ${text}`)
  }
  return res.json() as Promise<TokenResponse>
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      redirect_uri: process.env.GMAIL_REDIRECT_URI!,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Code exchange failed ${res.status}: ${text}`)
  }
  return res.json()
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function gmailFetch<T>(accessToken: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gmail API ${res.status} ${path}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Gmail operations ────────────────────────────────────────────────────────

export async function getLabels(accessToken: string): Promise<GmailLabel[]> {
  const data = await gmailFetch<{ labels: GmailLabel[] }>(accessToken, '/labels')
  return data.labels ?? []
}

export async function createLabel(accessToken: string, name: string): Promise<GmailLabel> {
  return gmailFetch<GmailLabel>(accessToken, '/labels', {
    method: 'POST',
    body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
  })
}

export async function getOrCreateLabel(accessToken: string, name: string): Promise<GmailLabel> {
  const labels = await getLabels(accessToken)
  const existing = labels.find(l => l.name.toLowerCase() === name.toLowerCase())
  return existing ?? createLabel(accessToken, name)
}

export async function listMessages(
  accessToken: string,
  labelIds: string[],
  maxResults = 50
): Promise<GmailMessageRef[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    labelIds: labelIds.join(','),
  })
  const data = await gmailFetch<{ messages?: GmailMessageRef[] }>(
    accessToken,
    `/messages?${params}`
  )
  return data.messages ?? []
}

export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  return gmailFetch<GmailMessage>(accessToken, `/messages/${messageId}?format=full`)
}

export async function modifyLabels(
  accessToken: string,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  await gmailFetch(accessToken, `/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  })
}

// ── Message body extraction ─────────────────────────────────────────────────

export function decodeBase64(data: string): string {
  // Gmail uses URL-safe base64
  const standard = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(standard, 'base64').toString('utf-8')
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|td|th|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Recursively extract a text/plain body, falling back to text/html. */
export function extractBody(part: GmailMessagePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64(part.body.data)
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return htmlToText(decodeBase64(part.body.data))
  }
  if (part.parts) {
    // Prefer plain over html
    const plain = part.parts.find(p => p.mimeType === 'text/plain')
    if (plain) return extractBody(plain)
    for (const child of part.parts) {
      const text = extractBody(child)
      if (text) return text
    }
  }
  return ''
}

export function extractHeader(msg: GmailMessage, name: string): string {
  return (
    msg.payload.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  )
}
