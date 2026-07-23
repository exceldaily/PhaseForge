import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, encryptToken } from '@/lib/scheduling/google'
import { gmailGetSignature } from '@/lib/quotes/gmail'

// Completes the per-user Gmail OAuth: stores ENCRYPTED tokens on the caller's
// own user_gmail_accounts row and pulls their signature right away so quotes
// match their company email. Refresh token never leaves the server.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const quotes = new URL('/app/quotes', req.url)

  const err = url.searchParams.get('error')
  if (err) { quotes.searchParams.set('error', err); return NextResponse.redirect(quotes) }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = req.cookies.get('qg_oauth_state')?.value
  if (!code || !state || state !== cookieState) {
    quotes.searchParams.set('error', 'state_mismatch')
    return NextResponse.redirect(quotes)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const { data: profile } = await supabase
    .from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) {
    quotes.searchParams.set('error', 'no_organization')
    return NextResponse.redirect(quotes)
  }

  try {
    const redirectUri = new URL('/api/quotes/gmail/callback', req.url).toString()
    const tokens = await exchangeCode(code, redirectUri)

    // Account email from the id_token payload (no extra API call needed)
    let email: string | null = null
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString())
        email = payload.email ?? null
      } catch { /* non-fatal */ }
    }

    // Grab the signature immediately while we hold a fresh token.
    const signature = await gmailGetSignature(tokens.access_token).catch(() => null)

    const row = {
      user_id: user.id,
      company_id: profile.company_id,
      account_email: email,
      access_token_enc: encryptToken(tokens.access_token),
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: QUOTES_SCOPE_LIST,
      is_active: true,
      last_error: null,
      ...(signature ? { email_signature: signature } : {}),
      // Only overwrite the refresh token when Google actually returns one
      ...(tokens.refresh_token ? { refresh_token_enc: encryptToken(tokens.refresh_token) } : {}),
    }
    const { error } = await supabase
      .from('user_gmail_accounts')
      .upsert(row, { onConflict: 'user_id' })
    if (error) throw new Error(error.message)

    quotes.searchParams.set('connected', '1')
  } catch (e) {
    quotes.searchParams.set('error', e instanceof Error ? e.message.slice(0, 200) : 'oauth_failed')
  }
  const res = NextResponse.redirect(quotes)
  res.cookies.delete('qg_oauth_state')
  return res
}

const QUOTES_SCOPE_LIST = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.settings.basic',
]
