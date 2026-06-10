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
    <div className="min-h-screen flex bg-slate-50">
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-between p-12">
        <GantticLogo variant="lockup" width={230} priority alt="Ganttic horizontal logo" />
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Your team&apos;s command center starts here.
          </h2>
          <p className="text-slate-400 text-lg">
            Set up your workspace in under 2 minutes. No credit card required.
          </p>
        </div>
        <div className="space-y-3">
          {['Unlimited projects', 'Real-time Gantt chart', 'Team collaboration', 'Role-based access'].map(f => (
            <div key={f} className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="h-5 w-5 rounded-full bg-indigo-600/20 border border-indigo-600 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-indigo-400" />
              </div>
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <GantticLogo variant="icon" width={40} priority alt="Ganttic app icon" />
            <span className="font-bold text-slate-900 text-lg">Ganttic</span>
          </div>

          {confirmEmail ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
                <Mail size={26} className="text-indigo-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
              <p className="text-slate-500">
                We sent a confirmation link to <span className="font-medium text-slate-700">{form.email}</span>.
                Click it to activate your account, then sign in to access your new workspace.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
          <>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Create your workspace</h1>
          <p className="text-slate-500 mb-8">Get your team up and running today</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <Input id="fullName" label="Your name" placeholder="Jane Smith" value={form.fullName} onChange={set('fullName')} icon={<User size={16} />} required />
            <Input id="companyName" label="Company name" placeholder="Acme Construction" value={form.companyName} onChange={set('companyName')} icon={<Building2 size={16} />} required />
            <Input id="email" type="email" label="Work email" placeholder="jane@acme.com" value={form.email} onChange={set('email')} icon={<Mail size={16} />} required />
            <Input id="password" type="password" label="Password" placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} value={form.password} onChange={set('password')} icon={<Lock size={16} />} required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            <Input id="confirmPassword" type="password" label="Confirm password" placeholder="Re-enter your password" value={form.confirmPassword} onChange={set('confirmPassword')} icon={<Lock size={16} />} required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            <p className="text-xs text-slate-500 -mt-1">
              Use at least {MIN_PASSWORD_LENGTH} characters and make sure both password fields match before creating the workspace.
            </p>
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
            )}
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Create workspace
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 font-medium hover:underline">Sign in</Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
