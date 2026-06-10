'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, User, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createWorkspace } from './actions'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { MIN_PASSWORD_LENGTH, validatePassword } from '@/lib/auth/password'
import { BRAND_NAME } from '@/lib/branding'

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ fullName: '', companyName: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const passwordError = validatePassword(form.password, form.confirmPassword)
    if (passwordError) {
      setError(passwordError)
      setLoading(false)
      return
    }

    const result = await createWorkspace({
      fullName: form.fullName,
      companyName: form.companyName,
      email: form.email,
      password: form.password,
    })

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // If email confirmation is required, there's no session yet — redirecting
    // into a protected route would bounce to /login and look like a lockout.
    if (result.success && !result.session) {
      setConfirmEmail(true)
      setLoading(false)
      return
    }

    router.push('/app/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex bg-[#f7efe6]">
      <div className="hidden lg:flex lg:w-1/2 bg-[radial-gradient(circle_at_top_left,rgba(255,210,120,0.16),transparent_22%),linear-gradient(160deg,#17100d_0%,#261811_46%,#100a08_100%)] flex-col justify-between p-12">
        <GantticLogo variant="lockup" width={250} priority alt="PhaseForge horizontal logo" />
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Your team&apos;s command center starts here.
          </h2>
          <p className="text-stone-300 text-lg">
            Set up your workspace in under 2 minutes. No credit card required.
          </p>
        </div>
        <div className="space-y-3">
          {['Unlimited projects', 'Real-time Gantt chart', 'Team collaboration', 'Role-based access'].map(f => (
            <div key={f} className="flex items-center gap-2 text-stone-300 text-sm">
              <div className="h-5 w-5 rounded-full border border-amber-500/60 bg-amber-500/15 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-amber-300" />
              </div>
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <GantticLogo variant="icon" width={40} priority alt="PhaseForge app icon" />
            <span className="font-bold text-slate-900 text-lg">{BRAND_NAME}</span>
          </div>

          {confirmEmail ? (
            <div className="rounded-2xl border border-[#eadac7] bg-white p-8 text-center shadow-[0_20px_40px_rgba(77,43,15,0.06)]">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                <Mail size={26} className="text-[#b46111]" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
              <p className="text-slate-500">
                We sent a confirmation link to <span className="font-medium text-slate-700">{form.email}</span>.
                Click it to activate your account, then sign in to access your new workspace.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block w-full rounded-lg bg-[linear-gradient(90deg,#b46111_0%,#d78829_42%,#f59e0b_100%)] px-4 py-3 font-medium text-white transition-all hover:brightness-105"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
          <>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Create your workspace</h1>
          <p className="text-slate-500 mb-8">Get your team up and running today</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <Input id="fullName" label="Your name" placeholder="Jane Smith" value={form.fullName} onChange={set('fullName')} icon={<User size={16} />} className="border-[#e7cfb4] focus:ring-[#d78829]" required />
            <Input id="companyName" label="Company name" placeholder="Acme Construction" value={form.companyName} onChange={set('companyName')} icon={<Building2 size={16} />} className="border-[#e7cfb4] focus:ring-[#d78829]" required />
            <Input id="email" type="email" label="Work email" placeholder="jane@acme.com" value={form.email} onChange={set('email')} icon={<Mail size={16} />} className="border-[#e7cfb4] focus:ring-[#d78829]" required />
            <Input id="password" type="password" label="Password" placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} value={form.password} onChange={set('password')} icon={<Lock size={16} />} className="border-[#e7cfb4] focus:ring-[#d78829]" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            <Input id="confirmPassword" type="password" label="Confirm password" placeholder="Re-enter your password" value={form.confirmPassword} onChange={set('confirmPassword')} icon={<Lock size={16} />} className="border-[#e7cfb4] focus:ring-[#d78829]" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            <p className="text-xs text-slate-500 -mt-1">
              Use at least {MIN_PASSWORD_LENGTH} characters and make sure both password fields match before creating the workspace.
            </p>
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
            )}
            <Button
              type="submit"
              className="w-full rounded-xl border-0 bg-[linear-gradient(90deg,#b46111_0%,#d78829_42%,#f59e0b_100%)] text-white shadow-[0_16px_28px_rgba(180,97,17,0.22)] hover:brightness-105 focus:ring-[#d78829]"
              size="lg"
              loading={loading}
            >
              Create workspace
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-[#b46111] font-medium hover:underline">Sign in</Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
