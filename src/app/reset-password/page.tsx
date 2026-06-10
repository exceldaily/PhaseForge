'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { Input } from '@/components/ui/Input'
import { MIN_PASSWORD_LENGTH, validatePassword } from '@/lib/auth/password'

type PageState = 'loading' | 'ready' | 'success' | 'expired'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')

    if (tokenHash && type === 'recovery') {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        .then(({ error }) => setState(error ? 'expired' : 'ready'))
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setState('ready')
      }
    })

    const timer = setTimeout(() => {
      setState((prev) => (prev === 'loading' ? 'expired' : prev))
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const passwordError = validatePassword(password, confirm)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setSaving(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setState('success')
    setTimeout(() => router.push('/app/dashboard'), 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7efe6] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <GantticLogo variant="lockup" width={210} priority alt="PhaseForge" />
        </div>

        <div className="rounded-2xl border border-[#eadac7] bg-white p-8 shadow-[0_20px_40px_rgba(77,43,15,0.06)]">
          {state === 'loading' && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#d78829] border-t-transparent" />
              <p className="text-sm text-slate-500">Verifying your reset link...</p>
            </div>
          )}

          {state === 'expired' && (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
                <Lock size={24} className="text-rose-600" />
              </div>
              <h2 className="mb-2 text-lg font-bold text-slate-900">Link expired or invalid</h2>
              <p className="mb-6 text-sm text-slate-500">
                Password reset links expire after 60 minutes. Request a new one below.
              </p>
              <a
                href="/forgot-password"
                className="inline-block rounded-xl bg-[linear-gradient(90deg,#b46111_0%,#d78829_42%,#f59e0b_100%)] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-105"
              >
                Request new link
              </a>
            </div>
          )}

          {state === 'success' && (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <ShieldCheck size={26} className="text-emerald-600" />
              </div>
              <h2 className="mb-2 text-lg font-bold text-slate-900">Password updated!</h2>
              <p className="text-sm text-slate-500">Taking you to your dashboard...</p>
            </div>
          )}

          {state === 'ready' && (
            <>
              <h1 className="mb-1 text-2xl font-bold text-slate-900">Set new password</h1>
              <p className="mb-8 text-sm text-slate-500">Choose a strong password for your account.</p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  id="password"
                  type="password"
                  label="New password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={16} />}
                  className="border-[#e7cfb4] focus:ring-[#d78829]"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                />
                <Input
                  id="confirm"
                  type="password"
                  label="Confirm new password"
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  icon={<Lock size={16} />}
                  className="border-[#e7cfb4] focus:ring-[#d78829]"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                />
                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 w-full rounded-xl bg-[linear-gradient(90deg,#b46111_0%,#d78829_42%,#f59e0b_100%)] text-sm font-semibold text-white transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
