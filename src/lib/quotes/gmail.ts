// Per-user Gmail client for the Quotes module. Each member connects THEIR OWN
// Gmail; tokens live in user_gmail_accounts (RLS: owner only) encrypted with
// the same AES-256-GCM helpers as calendar sync. Used ONLY for quote emails
// the user explicitly sends, reading their signature, and checking replies.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken, refreshAccessToken } from '@/lib/scheduling/google'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

export const QUOTES_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',      // send quote inquiries
  'https://www.googleapis.com/auth/gmail.readonly',  // detect vendor replies
  'https://www.googleapis.com/auth/gmail.settings.basic', // read signature
  'openid', 'email',
].join(' ')

export function quotesGmailStartUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: QUOTES_GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

export type UserGmail = {
  accessToken: string
  accountEmail: string | null
  signature: string | null
}

/**
 * Loads the signed-in user's Gmail connection, refreshing the access token
 * when it is about to expire. Returns null when the user has not connected.
 * RLS guarantees a user can only ever load their own row.
 */
// Schema-agnostic client type: the app's clients target the `phaseforge`
// schema (shared Supabase project), not the default `public`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getUserGmail(supabase: SupabaseClient<any, any, any>, userId: string): Promise<UserGmail | null> {
  const { data: row } = await supabase
    .from('user_gmail_accounts')
    .select('id, account_email, access_token_enc, refresh_token_enc, access_token_expires_at, email_signature, is_active')
    .eq('user_id', userId)
    .maybeSingle()
  if (!row || !row.is_active) return null

  let accessToken = decryptToken(row.access_token_enc)
  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0
  if (expiresAt - Date.now() < 60_000 && row.refresh_token_enc) {
    const fresh = await refreshAccessToken(row.refresh_token_enc)
    accessToken = fresh.access_token
    await supabase
      .from('user_gmail_accounts')
      .update({
        access_token_enc: encryptToken(fresh.access_token),
        access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
        last_error: null,
      })
      .eq('id', row.id)
  }
  return { accessToken, accountEmail: row.account_email, signature: row.email_signature }
}

function base64url(raw: string): string {
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 2822 message; multipart/alternative when an HTML body is supplied. */
function buildRawMessage(input: { to: string; subject: string; text: string; html?: string | null }): string {
  const headerLines = [`To: ${input.to}`, `Subject: ${input.subject}`, 'MIME-Version: 1.0']
  if (!input.html) {
    return [...headerLines, 'Content-Type: text/plain; charset="UTF-8"', '', input.text].join('\r\n')
  }
  const boundary = `bnd_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
  return [
    ...headerLines,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    input.html,
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

/** Sends one message from the user's own Gmail. Returns Gmail's ids. */
export async function gmailSendMessage(
  accessToken: string,
  input: { to: string; subject: string; text: string; html?: string | null },
): Promise<{ messageId: string; threadId: string }> {
  const res = await fetch(`${GMAIL}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64url(buildRawMessage(input)) }),
  })
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { id: string; threadId: string }
  return { messageId: data.id, threadId: data.threadId }
}

/**
 * Reads the user's Gmail signature (HTML), preferring their primary send-as
 * address. Throws on API failure so the caller can record WHY it failed — an
 * empty signature and a rejected request are very different problems, and
 * swallowing the latter made a disabled Gmail API look like "no signature set".
 */
export async function gmailGetSignature(accessToken: string): Promise<string | null> {
  const res = await fetch(`${GMAIL}/settings/sendAs`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    let message = detail.slice(0, 300)
    try { message = JSON.parse(detail).error?.message ?? message } catch { /* keep raw */ }
    throw new Error(`Gmail signature lookup failed (${res.status}): ${message}`)
  }
  const data = (await res.json()) as { sendAs?: { isPrimary?: boolean; isDefault?: boolean; signature?: string }[] }
  const withSignature = (data.sendAs ?? []).filter((s) => (s.signature ?? '').trim().length > 0)
  // Only consider addresses that actually carry a signature: a primary address
  // with an empty signature must not shadow an alias that has one.
  const pick = withSignature.find((s) => s.isPrimary)
    ?? withSignature.find((s) => s.isDefault)
    ?? withSignature[0]
  return pick ? (pick.signature ?? '').trim() : null
}

/**
 * Did anyone other than the sender write on this thread? Uses metadata-only
 * fetches; returns the reply time of the first foreign message, or null.
 */
export async function gmailThreadReplyAt(
  accessToken: string,
  threadId: string,
  senderEmail: string,
): Promise<string | null> {
  const res = await fetch(
    `${GMAIL}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as {
    messages?: { internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }[]
  }
  const me = senderEmail.toLowerCase()
  for (const msg of data.messages ?? []) {
    const from = msg.payload?.headers?.find((h) => h.name.toLowerCase() === 'from')?.value ?? ''
    if (from && !from.toLowerCase().includes(me)) {
      return msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString()
    }
  }
  return null
}
