/**
 * GET /api/dispatch/gmail-callback?code=...&state=...
 * Google redirects here after the user grants Gmail access.
 * Exchanges the code for tokens and saves them to dispatch_gmail_config.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForTokens } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (error) {
    return NextResponse.redirect(`${appUrl}/app/dispatch?gmail_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/app/dispatch?gmail_error=missing_params`)
  }

  // Verify CSRF nonce
  let companyId: string
  try {
    const payload = JSON.parse(Buffer.from(state, 'base64url').toString())
    const cookieNonce = req.cookies.get('gmail_oauth_nonce')?.value
    if (!cookieNonce || cookieNonce !== payload.nonce) {
      return NextResponse.redirect(`${appUrl}/app/dispatch?gmail_error=invalid_state`)
    }
    companyId = payload.companyId
  } catch {
    return NextResponse.redirect(`${appUrl}/app/dispatch?gmail_error=bad_state`)
  }

  // Exchange code for tokens
  let tokens: { access_token: string; refresh_token: string; expires_in: number }
  try {
    tokens = await exchangeCodeForTokens(code)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'token_exchange_failed'
    return NextResponse.redirect(`${appUrl}/app/dispatch?gmail_error=${encodeURIComponent(msg)}`)
  }

  if (!tokens.refresh_token) {
    return NextResponse.redirect(`${appUrl}/app/dispatch?gmail_error=no_refresh_token`)
  }

  // Resolve the Gmail account email
  let gmailAccount = 'unknown@gmail.com'
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (userRes.ok) {
      const info = await userRes.json()
      gmailAccount = info.email ?? gmailAccount
    }
  } catch { /* non-fatal */ }

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Save / update config using admin client (bypasses RLS)
  const supabase = createAdminClient()
  const { error: dbErr } = await supabase.from('dispatch_gmail_config').upsert(
    {
      company_id: companyId,
      gmail_account: gmailAccount,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      token_expires_at: tokenExpiresAt,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' }
  )

  if (dbErr) {
    return NextResponse.redirect(
      `${appUrl}/app/dispatch?gmail_error=${encodeURIComponent(dbErr.message)}`
    )
  }

  const response = NextResponse.redirect(`${appUrl}/app/dispatch?gmail_connected=1`)
  // Clear the CSRF cookie
  response.cookies.set('gmail_oauth_nonce', '', { maxAge: 0, path: '/' })
  return response
}
