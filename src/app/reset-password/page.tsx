'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { Input } from '@/components/ui/Input'

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

    // PKCE flow: token_hash in query string
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')

    if (tokenHash && type === 'recovery') {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        .then(({ error }) => setState(error ? 'expired' : 'ready'))
      return
    }

    // Implicit flow: PASSWORD_RECOVERY event from URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setState('ready')
    })

    // Fallback timeout — if nothing fires, link is expired/missing
    const timer = setTimeout(() => {
      setState((prev) => prev === 'loading' ? 'expired' : prev)
    }, 4000)

    return () => { subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSaving(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setSaving(false)

    if (updateError) { setError(updateError.message); return }

    setState('success')
    setTimeout(() => router.push('/app/dashboard'), 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <GantticLogo variant="lockup" width={180} priority alt="Ganttic" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {state === 'loading' && (
            <div className="text-center py-8">
              <div className="h-8 w-8 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Verifying your reset link…</p>
            </div>
          )}

          {state === 'expired' && (
            <div className="text-center py-4">
              <div className="h-14 w-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                <Lock size={24} className="text-rose-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Link expired or invalid</h2>
              <p className="text-slate-500 text-sm mb-6">
                Password reset links expire after 60 minutes. Request a new one below.
              </p>
              <a href="/forgot-password" className="inline-block rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
                Request new link
              </a>
            </div>
          )}

          {state === 'success' && (
            <div className="text-center py-4">
              <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={26} className="text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Password updated!</h2>
              <p className="text-slate-500 text-sm">Taking you to your dashboard…</p>
            </div>
          )}

          {state === 'ready' && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Set new password</h1>
              <p className="text-slate-500 text-sm mb-8">Choose a strong password for your account.</p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input id="password" type="password" label="New password" placeholder="Min. 8 characters"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={16} />} required minLength={8} />
                <Input id="confirm" type="password" label="Confirm new password" placeholder="Repeat your password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  icon={<Lock size={16} />} required />
                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                )}
                <button type="submit" disabled={saving}
                  className="w-full h-11 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  {saving ? 'Saving…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
