'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { MIN_PASSWORD_LENGTH, validatePassword } from '@/lib/auth/password'
import { acceptInvite, setInvitePassword } from './actions'

export default function InviteAcceptPage() {
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'password' | 'confirming' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Check if user is authenticated (invite link clicked)
  useEffect(() => {
    const checkAuth = async () => {
      // Extract token from URL params
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')
      const email = params.get('email')

      const result = await acceptInvite(token || undefined, email || undefined)
      if (result.error) {
        setState('error')
        setMessage(result.error)
        return
      }
      // If they need to set a password, show password form
      if (result.needsPassword) {
        setState('password')
      } else {
        setState('done')
        setTimeout(() => router.push('/app/dashboard'), 1200)
      }
    }
    checkAuth()
  }, [router])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password || !confirmPassword) {
      setError('Both fields are required')
      return
    }

    const passwordError = validatePassword(password, confirmPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setSaving(true)
    setState('confirming')

    // Extract invite params from URL
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || undefined
    const email = params.get('email') || undefined

    const result = await setInvitePassword(password, token, email)
    setSaving(false)

    if (result.error) {
      setState('password')
      setError(result.error)
      return
    }

    setState('done')
    setTimeout(() => router.push('/app/dashboard'), 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7efe6] p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <GantticLogo variant="lockup" width={220} priority alt="PhaseForge logo" />
        </div>

        <div className="rounded-2xl border border-[#eadac7] bg-white p-8 shadow-[0_20px_40px_rgba(77,43,15,0.06)]">
          {state === 'loading' && (
            <>
              <Loader2 size={40} className="mx-auto mb-4 animate-spin text-[#d78829]" />
              <h1 className="text-xl font-bold text-slate-900">Verifying your invitation...</h1>
              <p className="mt-2 text-slate-500">One moment please.</p>
            </>
          )}

          {state === 'password' && (
            <>
              <h1 className="text-xl font-bold text-slate-900 mb-1">Set your password</h1>
              <p className="text-slate-500 mb-6 text-sm">Create a secure password to complete your account setup.</p>

              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#d78829]"
                    disabled={saving}
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#d78829]"
                    disabled={saving}
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-[linear-gradient(90deg,#b46111_0%,#d78829_42%,#f59e0b_100%)] px-4 py-2.5 font-medium text-white transition-all hover:brightness-105 disabled:opacity-50"
                >
                  {saving ? 'Setting up...' : 'Complete setup'}
                </button>
              </form>
            </>
          )}

          {state === 'confirming' && (
            <>
              <Loader2 size={40} className="mx-auto mb-4 animate-spin text-[#d78829]" />
              <h1 className="text-xl font-bold text-slate-900">Setting up your password...</h1>
              <p className="mt-2 text-slate-500">One moment.</p>
            </>
          )}

          {state === 'done' && (
            <>
              <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-500" />
              <h1 className="text-xl font-bold text-slate-900">You&apos;re in!</h1>
              <p className="mt-2 text-slate-500">Redirecting to your dashboard...</p>
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
