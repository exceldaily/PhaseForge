import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { googleConfigured, oauthStartUrl } from '@/lib/scheduling/google'

// Admin-only: begins the Google OAuth consent flow for the org connection.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles').select('ops_role, role').eq('id', user.id).single()
  const isAdmin = ['owner', 'admin'].includes(profile?.ops_role ?? '') ||
    ['owner', 'admin'].includes(profile?.role ?? '')
  if (!isAdmin) {
    return NextResponse.redirect(new URL('/app/settings/scheduling?error=admin_only', req.url))
  }
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL('/app/settings/scheduling?error=not_configured', req.url))
  }

  const state = crypto.randomBytes(24).toString('hex')
  const redirectUri = new URL('/api/google/oauth/callback', req.url).toString()
  const res = NextResponse.redirect(oauthStartUrl(redirectUri, state))
  res.cookies.set('gcal_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  })
  return res
}
