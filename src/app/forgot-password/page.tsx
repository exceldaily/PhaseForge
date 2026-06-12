'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { Input } from '@/components/ui/Input'
import { getFriendlyAuthError, normalizeAuthEmail } from '@/lib/auth/password'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const normalizedEmail = normalizeAuthEmail(email)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })

    setLoading(false)
    if (resetError) {
      setError(getFriendlyAuthError(resetError.message))
      return
    }

    setEmail(normalizedEmail)
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7efe6] px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <GantticLogo variant="lockup" width={210} priority alt="PhaseForge" />
        </div>

        <div className="rounded-2xl border border-[#eadac7] bg-white p-8 shadow-[0_20px_40px_rgba(77,43,15,0.06)]">
          {sent ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <Mail size={26} className="text-emerald-600" />
              </div>
              <h1 className="mb-2 text-xl font-bold text-slate-900">Check your email</h1>
              <p className="mb-6 text-sm text-slate-500">
                We sent a password reset link to <span className="font-medium text-slate-700">{email}</span>.
                The link expires in 60 minutes.
              </p>
              <p className="text-xs text-slate-400">
                Didn&apos;t receive it? Check your spam folder or{' '}
                <button onClick={() => setSent(false)} className="font-medium text-[#b46111] hover:underline">
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-2xl font-bold text-slate-900">Forgot password?</h1>
              <p className="mb-8 text-sm text-slate-500">Enter your email and we&apos;ll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  id="email"
                  type="email"
                  label="Email address"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={16} />}
                  className="border-[#e7cfb4] focus:ring-[#d78829]"
                  required
                />
                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-xl bg-[linear-gradient(90deg,#b46111_0%,#d78829_42%,#f59e0b_100%)] text-sm font-semibold text-white transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
