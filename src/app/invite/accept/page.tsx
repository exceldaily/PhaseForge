'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { acceptInvite } from './actions'

export default function InviteAcceptPage() {
  const router = useRouter()
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const result = await acceptInvite()
      if (cancelled) return

      if (result.error) {
        setState('error')
        setMessage(result.error)
        return
      }

      setState('done')
      // Brief pause so the user sees confirmation, then into the app.
      setTimeout(() => router.push('/app/dashboard'), 1200)
    }

    run()
    return () => { cancelled = true }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <GantticLogo variant="lockup" width={200} priority alt="Ganttic logo" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {state === 'working' && (
            <>
              <Loader2 size={40} className="mx-auto mb-4 animate-spin text-indigo-600" />
              <h1 className="text-xl font-bold text-slate-900">Setting up your access…</h1>
              <p className="mt-2 text-slate-500">Joining your workspace, one moment.</p>
            </>
          )}

          {state === 'done' && (
            <>
              <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-500" />
              <h1 className="text-xl font-bold text-slate-900">You&apos;re in!</h1>
              <p className="mt-2 text-slate-500">Redirecting you to your dashboard…</p>
            </>
          )}

          {state === 'error' && (
            <>
              <AlertCircle size={40} className="mx-auto mb-4 text-rose-500" />
              <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
              <p className="mt-2 text-slate-500">{message}</p>
              <Link
                href="/login"
                className="mt-6 inline-block w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Go to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
