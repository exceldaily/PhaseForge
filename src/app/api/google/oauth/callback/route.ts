import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, encryptToken } from '@/lib/scheduling/google'

// Completes OAuth: exchanges the code, stores ENCRYPTED tokens on the org's
// connection row. Refresh token never leaves the server.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const settings = new URL('/app/settings/scheduling', req.url)

  const err = url.searchParams.get('error')
  if (err) { settings.searchParams.set('error', err); return NextResponse.redirect(settings) }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = req.cookies.get('gcal_oauth_state')?.value
  if (!code || !state || state !== cookieState) {
    settings.searchParams.set('error', 'state_mismatch')
    return NextResponse.redirect(settings)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const { data: profile } = await supabase
    .from('profiles').select('company_id, ops_role, role').eq('id', user.id).single()
  const isAdmin = ['owner', 'admin'].includes(profile?.ops_role ?? '') ||
    ['owner', 'admin'].includes(profile?.role ?? '')
  if (!profile?.company_id || !isAdmin) {
    settings.searchParams.set('error', 'admin_only')
    return NextResponse.redirect(settings)
  }

  try {
    const redirectUri = new URL('/api/google/oauth/callback', req.url).toString()
    const tokens = await exchangeCode(code, redirectUri)

    // Account email from the id_token payload (no extra API call needed)
    let email: string | null = null
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString())
        email = payload.email ?? null
      } catch { /* non-fatal */ }
    }

    const row = {
      company_id: profile.company_id,
      connected_by: user.id,
      account_email: email,
      access_token_enc: encryptToken(tokens.access_token),
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
      last_error: null,
      updated_at: new Date().toISOString(),
      // Only overwrite the refresh token when Google actually returns one
      ...(tokens.refresh_token ? { refresh_token_enc: encryptToken(tokens.refresh_token) } : {}),
    }
    const { error } = await supabase
      .from('gcal_connections')
      .upsert(row, { onConflict: 'company_id' })
    if (error) throw new Error(error.message)

    settings.searchParams.set('connected', '1')
  } catch (e) {
    settings.searchParams.set('error', e instanceof Error ? e.message.slice(0, 200) : 'oauth_failed')
  }
  const res = NextResponse.redirect(settings)
  res.cookies.delete('gcal_oauth_state')
  return res
}
