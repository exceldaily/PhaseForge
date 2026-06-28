/**
 * GET /api/dispatch/gmail-auth
 * Initiates the Gmail OAuth2 flow. Must be visited by an authenticated admin/owner.
 * Redirects to Google's consent screen.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify', // read + label messages
  'https://www.googleapis.com/auth/gmail.labels',  // create labels
].join(' ')

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // CSRF state: encode company_id + random nonce as base64
  const nonce = crypto.randomUUID()
  const state = Buffer.from(JSON.stringify({ companyId: profile.company_id, nonce })).toString('base64url')

  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID!,
    redirect_uri: process.env.GMAIL_REDIRECT_URI!,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent', // always get refresh_token
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  // Store nonce in a short-lived cookie for CSRF verification in the callback
  const response = NextResponse.redirect(authUrl)
  response.cookies.set('gmail_oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })
  return response
}
