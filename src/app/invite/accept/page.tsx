'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
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
      setTimeout(() => router.push('/app/dashboard'), 1200)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7efe6] p-8">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <GantticLogo variant="lockup" width={220} priority alt="PhaseForge logo" />
        </div>

        <div className="rounded-2xl border border-[#eadac7] bg-white p-8 shadow-[0_20px_40px_rgba(77,43,15,0.06)]">
          {state === 'working' && (
            <>
              <Loader2 size={40} className="mx-auto mb-4 animate-spin text-[#d78829]" />
              <h1 className="text-xl font-bold text-slate-900">Setting up your access...</h1>
              <p className="mt-2 text-slate-500">Joining your workspace, one moment.</p>
            </>
          )}

          {state === 'done' && (
            <>
              <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-500" />
              <h1 className="text-xl font-bold text-slate-900">You&apos;re in!</h1>
              <p className="mt-2 text-slate-500">Redirecting you to your dashboard...</p>
            </>
          )}

          {state === 'error' && (
            <>
              <AlertCircle size={40} className="mx-auto mb-4 text-rose-500" />
              <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
              <p className="mt-2 text-slate-500">{message}</p>
              <Link
                href="/login"
                className="mt-6 inline-block w-full rounded-lg bg-[linear-gradient(90deg,#b46111_0%,#d78829_42%,#f59e0b_100%)] px-4 py-3 font-medium text-white transition-all hover:brightness-105"
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
