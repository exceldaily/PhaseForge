'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { Input } from '@/components/ui/Input'

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
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    setLoading(false)
    if (resetError) { setError(resetError.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <GantticLogo variant="lockup" width={180} priority alt="Ganttic" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Mail size={26} className="text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">Check your email</h1>
              <p className="text-slate-500 text-sm mb-6">
                We sent a password reset link to{' '}
                <span className="font-medium text-slate-700">{email}</span>.
                The link expires in 60 minutes.
              </p>
              <p className="text-xs text-slate-400">
                Didn&apos;t receive it? Check your spam folder or{' '}
                <button onClick={() => setSent(false)} className="text-indigo-600 hover:underline font-medium">
                  try again
                </button>.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Forgot password?</h1>
              <p className="text-slate-500 text-sm mb-8">Enter your email and we&apos;ll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  id="email"
                  type="email"
                  label="Email address"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={16} />}
                  required
                />
                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
