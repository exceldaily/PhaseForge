import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// How long we give Supabase Auth before letting the request through anyway.
// Every /app page re-verifies auth server-side (getUser + redirect), so the
// middleware gate can fail OPEN on a slow auth backend — a 3s degraded hop
// beats the 25s hang + 504 that a hung fetch causes (the "site is frozen /
// crashing" failure mode).
const AUTH_TIMEOUT_MS = 3000

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/invite')
  const isAppPage = pathname.startsWith('/app')

  // No Supabase auth cookie at all: nothing to refresh, nothing to verify.
  // Skip the network round-trip entirely.
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'))
  if (!hasAuthCookie) {
    if (isAppPage) return NextResponse.redirect(new URL('/login', request.url))
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user: { id: string } | null = null
  let authDegraded = false
  try {
    user = await Promise.race([
      supabase.auth.getUser().then((r) => r.data.user),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('auth check timed out')), AUTH_TIMEOUT_MS)),
    ])
  } catch {
    // Auth backend slow or unreachable: fail open. Server components still
    // enforce auth on every /app page; worst case an expired session sees a
    // server-side redirect instead of a middleware one.
    authDegraded = true
  }

  if (!authDegraded && !user && isAppPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthPage && !pathname.startsWith('/invite')) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  return supabaseResponse
}

// Only run where the gate matters: the app shell and auth pages. API routes
// (cron, webhooks, OAuth callbacks) do their own auth and must never stall
// behind a session-refresh round-trip.
export const config = {
  matcher: ['/app/:path*', '/login', '/signup', '/invite/:path*'],
}
