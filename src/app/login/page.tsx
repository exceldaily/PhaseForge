'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Manrope, Sora } from 'next/font/google'
import {
  ArrowRight,
  Database,
  Lock,
  Mail,
  ShieldCheck,
  Play,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { BRAND_NAME } from '@/lib/branding'
import { cn } from '@/lib/utils'

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

const SECURITY_POINTS = [
  { icon: ShieldCheck, title: 'Enterprise Security', subtitle: 'End-to-end encryption' },
  { icon: Database, title: '99.9% Uptime', subtitle: 'Reliable & secure' },
  { icon: Lock, title: 'Your Data', subtitle: 'Always protected' },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })

    if (loginError) {
      setError(loginError.message)
      setLoading(false)
      return
    }

    router.push('/app/dashboard')
    router.refresh()
  }

  return (
    <div className={cn(manrope.className, 'min-h-screen bg-slate-900 text-white overflow-hidden')}>
      {/* Video Background */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover"
        >
          <source src="/PhaseForge-Video.mp4" type="video/mp4" />
        </video>
        {/* Gradient Overlay - Dark on edges, lighter in center */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/70" />
        {/* Bottom gradient for form area */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col lg:grid lg:grid-cols-[1fr_480px]">
        {/* Left side - Hero content */}
        <section className="flex flex-col justify-between px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
          {/* Logo */}
          <div>
            <GantticLogo variant="lockup" width={320} priority alt="PhaseForge horizontal logo" />
          </div>

          {/* Hero Text */}
          <div className="max-w-2xl">
            <h1 className={cn(sora.className, 'text-5xl font-extrabold leading-[1.1] lg:text-6xl xl:text-7xl')}>
              <span className="block text-white">Transform Your</span>
              <span className="mt-2 block bg-gradient-to-r from-amber-300 via-orange-300 to-orange-400 bg-clip-text text-transparent">
                Project Management
              </span>
            </h1>
            <p className="mt-8 max-w-xl text-xl leading-8 text-stone-200 lg:text-2xl">
              Professional Gantt charts and real-time collaboration. Built for teams that deliver on time, every time.
            </p>

            {/* CTA Button - Alternative to form */}
            <div className="mt-12 flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-orange-500/30 transition-all hover:scale-105 hover:shadow-orange-500/50"
              >
                <span>Start Free</span>
                <ArrowRight size={20} />
              </Link>
              <button className="inline-flex items-center gap-3 rounded-2xl border-2 border-white/30 px-8 py-4 text-lg font-semibold text-white backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10">
                <Play size={18} className="fill-current" />
                <span>Watch Demo</span>
              </button>
            </div>
          </div>

          {/* Bottom metrics */}
          <div className="mt-16 grid grid-cols-3 gap-4 md:gap-8">
            <div>
              <p className={cn(sora.className, 'text-3xl font-bold text-amber-300 md:text-4xl')}>12k+</p>
              <p className="mt-2 text-sm text-stone-300">Active Projects</p>
            </div>
            <div>
              <p className={cn(sora.className, 'text-3xl font-bold text-amber-300 md:text-4xl')}>50k+</p>
              <p className="mt-2 text-sm text-stone-300">Team Members</p>
            </div>
            <div>
              <p className={cn(sora.className, 'text-3xl font-bold text-amber-300 md:text-4xl')}>94%</p>
              <p className="mt-2 text-sm text-stone-300">On-Time</p>
            </div>
          </div>
        </section>

        {/* Right side - Login Form */}
        <section className="relative flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-12 lg:py-0">
          <div className="mx-auto w-full max-w-sm">
            {/* Mobile Logo */}
            <div className="mb-12 flex items-center gap-3 lg:hidden">
              <GantticLogo variant="icon" width={44} priority alt="PhaseForge app icon" />
              <span className={cn(sora.className, 'text-xl font-bold tracking-tight text-white')}>{BRAND_NAME}</span>
            </div>

            {/* Form Container */}
            <div className="rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-xl shadow-2xl">
              <h2 className={cn(sora.className, 'text-3xl font-bold tracking-tight text-white')}>
                Welcome back
              </h2>
              <p className="mt-3 text-lg text-stone-200">Sign in to your workspace</p>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <Input
                  id="email"
                  type="email"
                  label="Email address"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  icon={<Mail size={19} />}
                  className="h-14 rounded-xl border-white/20 bg-white/10 pl-14 text-base text-white placeholder:text-stone-400 shadow-lg backdrop-blur-sm focus:border-amber-400/50 focus:ring-amber-400/30"
                  required
                />
                <div>
                  <Input
                    id="password"
                    type="password"
                    label="Password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    icon={<Lock size={19} />}
                    className="h-14 rounded-xl border-white/20 bg-white/10 pl-14 text-base text-white placeholder:text-stone-400 shadow-lg backdrop-blur-sm focus:border-amber-400/50 focus:ring-amber-400/30"
                    required
                  />
                  <div className="mt-3 flex justify-end">
                    <Link href="/forgot-password" className="text-sm text-amber-300 transition-colors hover:text-amber-200">
                      Forgot password?
                    </Link>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-400/50 bg-rose-500/20 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex h-14 w-full items-center justify-between rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 px-6 text-base font-semibold text-white shadow-lg shadow-orange-500/30 transition-all hover:scale-105 hover:shadow-orange-500/50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
                >
                  <span className="w-6" />
                  <span>{loading ? 'Signing in...' : 'Sign in'}</span>
                  <ArrowRight className="transition-transform group-hover:translate-x-1" size={20} />
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-stone-300">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="font-semibold text-amber-300 transition-colors hover:text-amber-200">
                  Create one free
                </Link>
              </p>
            </div>

            {/* Security info */}
            <div className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Why teams trust PhaseForge</p>
              <div className="space-y-3">
                {SECURITY_POINTS.map(({ icon: Icon, title, subtitle }) => (
                  <div key={title} className="flex items-start gap-3">
                    <Icon size={16} className="mt-1 flex-shrink-0 text-amber-300" />
                    <div>
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="text-xs text-stone-400">{subtitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
