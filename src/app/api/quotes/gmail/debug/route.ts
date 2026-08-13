import { NextResponse } from 'next/server'

// TEMPORARY diagnostic for the redirect_uri_mismatch hunt: reveals which
// Google OAuth client the deployment is using. Client ids are public (they
// appear in every OAuth redirect URL); the secret is never exposed here.
// Remove once the Quotes Gmail connect flow is confirmed working.
export async function GET() {
  const id = process.env.GOOGLE_CLIENT_ID ?? ''
  return NextResponse.json({
    configured: id.length > 0,
    clientIdProjectNumber: id.split('-')[0] || null,
    clientIdSuffix: id.slice(-30),
  })
}
