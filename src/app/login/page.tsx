'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Manrope, Sora } from 'next/font/google'
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FolderKanban,
  Lock,
  Mail,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { cn } from '@/lib/utils'

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

const LEFT_METRICS = [
  { icon: FolderKanban, value: '12k+', label: 'Active Projects' },
  { icon: Users, value: '50k+', label: 'Team Members' },
  { icon: CheckCircle2, value: '94%', label: 'On-Time Delivery' },
]

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
    <div className={cn(manrope.className, 'min-h-screen bg-[#f4f7ff] text-slate-900')}>
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
        <section className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(40,116,255,0.20),transparent_26%),radial-gradient(circle_at_80%_55%,rgba(45,212,255,0.12),transparent_28%),linear-gradient(180deg,#030918_0%,#071433_48%,#040b1c_100%)] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:76px_76px] opacity-25" />
          <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent" />
          <div className="absolute -bottom-36 left-[-18%] h-[24rem] w-[54rem] rotate-[8deg] rounded-[999px] border border-cyan-400/10" />
          <div className="absolute -bottom-44 left-[-10%] h-[28rem] w-[60rem] rotate-[8deg] rounded-[999px] border border-blue-500/20" />
          <div className="absolute -bottom-52 left-[-4%] h-[31rem] w-[66rem] rotate-[8deg] rounded-[999px] border border-indigo-500/20" />
          <div className="absolute -bottom-56 left-[4%] h-[33rem] w-[68rem] rotate-[8deg] rounded-[999px] border border-blue-400/15" />
          <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />

          <div className="relative">
            <GantticLogo variant="lockup" width={450} priority alt="Ganttic horizontal logo" />
          </div>

          <div className="relative max-w-xl pt-16">
            <h1 className={cn(sora.className, 'text-5xl font-extrabold leading-[0.95] xl:text-[5.5rem]')}>
              <span className="block text-white">Plan smarter.</span>
              <span className="mt-3 block bg-[linear-gradient(90deg,#19b6ff_0%,#3957ff_50%,#6b38ff_100%)] bg-clip-text text-transparent">
                Build faster.
              </span>
            </h1>
            <div className="mt-8 h-1 w-52 rounded-full bg-[linear-gradient(90deg,#246bff_0%,#1fd4ff_100%)] shadow-[0_0_28px_rgba(32,152,255,0.55)]" />
            <p className="mt-8 max-w-lg text-[1.05rem] leading-9 text-slate-300 xl:text-[1.12rem]">
              Professional Gantt chart project management built for teams who deliver.
            </p>
          </div>

          <div className="relative grid max-w-xl grid-cols-3 gap-6 pt-10">
            {LEFT_METRICS.map(({ icon: Icon, value, label }, index) => (
              <div
                key={label}
                className={cn(
                  'relative pr-6',
                  index < LEFT_METRICS.length - 1 && 'after:absolute after:right-0 after:top-2 after:h-24 after:w-px after:bg-white/12'
                )}
              >
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-white/5 shadow-[0_18px_40px_rgba(5,13,38,0.35)] backdrop-blur-xl">
                  <Icon size={28} className="text-[#13a6ff]" />
                </div>
                <p className={cn(sora.className, 'text-4xl font-bold tracking-tight text-white')}>{value}</p>
                <p className="mt-2 text-lg text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(73,120,255,0.12),transparent_26%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-6 py-8 sm:px-10 lg:px-14">
          <div className="absolute right-[-10rem] top-[-10rem] h-[26rem] w-[26rem] rounded-full border border-indigo-100" />
          <div className="absolute right-[-16rem] top-[-4rem] h-[34rem] w-[34rem] rounded-full border border-indigo-50" />
          <div className="absolute bottom-[-12rem] right-[-10rem] h-[28rem] w-[28rem] rounded-full border border-indigo-100" />

          <div className="relative mx-auto flex min-h-full max-w-[470px] flex-col justify-center">
            <div className="mb-12 flex items-center gap-3 lg:hidden">
              <GantticLogo variant="icon" width={44} priority alt="Ganttic app icon" />
              <span className={cn(sora.className, 'text-xl font-bold tracking-tight text-slate-900')}>Ganttic</span>
            </div>

            <div className="rounded-[2rem] border border-white/60 bg-white/78 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:p-8 lg:border-none lg:bg-transparent lg:p-0 lg:shadow-none">
              <h1 className={cn(sora.className, 'text-4xl font-bold tracking-tight text-slate-900 sm:text-[2.8rem]')}>
                Welcome back
              </h1>
              <p className="mt-3 text-lg text-[#50638f]">Sign in to your workspace</p>

              <form onSubmit={handleLogin} className="mt-12 space-y-6">
                <Input
                  id="email"
                  type="email"
                  label="Email address"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  icon={<Mail size={19} />}
                  className="h-14 rounded-2xl border-slate-200 bg-white/95 pl-14 text-base text-slate-800 shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
                  required
                />
                <Input
                  id="password"
                  type="password"
                  label="Password"
                  placeholder="........"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  icon={<Lock size={19} />}
                  className="h-14 rounded-2xl border-slate-200 bg-white/95 pl-14 text-base text-slate-800 shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
                  required
                />

                {error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex h-14 w-full items-center justify-between rounded-2xl bg-[linear-gradient(90deg,#2238ff_0%,#3d49ff_38%,#6932ff_100%)] px-6 text-lg font-semibold text-white shadow-[0_24px_45px_rgba(53,66,255,0.32)] transition-all hover:translate-y-[-1px] hover:shadow-[0_28px_58px_rgba(53,66,255,0.4)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="w-6" />
                  <span>{loading ? 'Signing in...' : 'Sign in'}</span>
                  <ArrowRight className="transition-transform group-hover:translate-x-1" size={20} />
                </button>
              </form>

              <p className="mt-10 text-center text-base text-[#5c6d94]">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="font-semibold text-[#3348ff] transition-colors hover:text-[#2337dd]">
                  Create one
                </Link>
              </p>
            </div>

            <div className="mt-10 grid gap-4 border-t border-slate-200/80 pt-8 sm:grid-cols-3">
              {SECURITY_POINTS.map(({ icon: Icon, title, subtitle }, index) => (
                <div
                  key={title}
                  className={cn(
                    'flex items-start gap-3',
                    index < SECURITY_POINTS.length - 1 && 'sm:border-r sm:border-slate-200 sm:pr-3'
                  )}
                >
                  <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                    <Icon size={19} className="text-slate-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-1 text-sm text-[#687899]">{subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
