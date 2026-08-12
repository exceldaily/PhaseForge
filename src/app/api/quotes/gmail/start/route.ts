import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { googleConfigured } from '@/lib/scheduling/google'
import { quotesGmailStartUrl } from '@/lib/quotes/gmail'

// Begins the per-user Gmail consent flow for the Quotes module. Unlike the
// org-wide calendar connection this is open to every signed-in member — each
// person connects their OWN Gmail and quotes send from their own address.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  if (!googleConfigured()) {
    return NextResponse.redirect(new URL('/app/quotes?error=not_configured', req.url))
  }

  const state = crypto.randomBytes(24).toString('hex')
  const redirectUri = new URL('/api/quotes/gmail/callback', req.url).toString()
  const res = NextResponse.redirect(quotesGmailStartUrl(redirectUri, state))
  res.cookies.set('qg_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  })
  return res
}
