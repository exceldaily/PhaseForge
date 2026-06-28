'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Sora, Manrope } from 'next/font/google'
import { ArrowRight, Lock, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { ForceLightTheme } from '@/components/layout/ForceLightTheme'
import { getFriendlyAuthError, normalizeAuthEmail } from '@/lib/auth/password'

const sora    = Sora({ subsets: ['latin'], weight: ['700', '800'] })
const manrope = Manrope({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

// ── Static data ──────────────────────────────────────────────────────────
const CAPS = [
  { n: '01', tag: 'SCHEDULE',   title: 'Gantt Timeline',    body: 'Drag-and-drop phase scheduling from mobilization to closeout. Zoom from day view to quarter view, set dependencies, and see your entire project on one screen.', specs: ['Day · Week · Month · Quarter zoom', 'Phase dependencies', 'Milestone tracking'] },
  { n: '02', tag: 'KANBAN',     title: 'Project Boards',    body: 'Kanban boards with custom columns built around your workflow. Scope visibility by team so field crews see their boards and office staff see theirs.', specs: ['Custom stage columns', 'Team-scoped visibility', 'Custom field configurator'] },
  { n: '03', tag: 'QA / FIELD', title: 'Punch Lists',       body: 'Log punch and QA items on-site with photos. Attach before/after images, assign to a trade, and track status to closed — all from your phone.', specs: ['Before/after photo pairs', 'Trade assignment & status', 'Excel import'] },
  { n: '04', tag: 'TICKETS',    title: 'Tickets',           body: 'Track service calls and work orders on a shared board. Forward ticket details to any vendor email straight from the card, set reminders, and keep a running activity log per ticket.', specs: ['Forward to vendor email', 'Timed reminders', 'Full activity log'] },
  { n: '05', tag: 'PEOPLE',     title: 'Team Management',   body: 'Invite your team, set their role, and scope what they can access. Four tiers — owner, admin, manager, member — with board-level visibility controls on top.', specs: ['Owner / admin / manager / member', 'Board-level access control', 'Email invite flow'] },
  { n: '06', tag: 'REPORTING',  title: 'Reports',           body: 'Print project summaries and phase progress reports. Useful for owner updates, bank draws, and internal reviews. Export to PDF directly from the browser.', specs: ['Printable PDF export', 'Phase completion tracking', 'Portfolio overview'] },
]

const GANTT = [
  { label: 'Site Mobilization',  s: 0,  w: 14, pct: 100, done: true  },
  { label: 'Foundation Work',    s: 10, w: 20, pct: 100, done: true  },
  { label: 'Steel Framework',    s: 25, w: 26, pct: 78,  done: false },
  { label: 'MEP Rough-In',       s: 38, w: 24, pct: 45,  done: false },
  { label: 'Interior Finishing', s: 54, w: 28, pct: 12,  done: false },
  { label: 'Final Inspection',   s: 72, w: 18, pct: 0,   done: false },
]
const TODAY = 57

// ── Page ─────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter()
  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [on,      setOn]      = useState(false)    // entrance trigger
  const ganttRef  = useRef<HTMLDivElement>(null)
  const [ganttOn, setGanttOn] = useState(false)
  const capsRef   = useRef<HTMLDivElement>(null)
  const [capsOn,  setCapsOn]  = useState(false)

  useEffect(() => { const t = setTimeout(() => setOn(true), 120); return () => clearTimeout(t) }, [])

  useEffect(() => {
    const make = (ref: React.RefObject<HTMLDivElement | null>, set: (v: boolean) => void, thr = 0.2) => {
      if (!ref.current) return
      const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) set(true) }, { threshold: thr })
      obs.observe(ref.current)
      return () => obs.disconnect()
    }
    make(ganttRef, setGanttOn, 0.25)
    make(capsRef,  setCapsOn,  0.08)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await createClient().auth.signInWithPassword({
      email: normalizeAuthEmail(email), password: pass,
    })
    if (err) { setError(getFriendlyAuthError(err.message)); setLoading(false); return }
    router.push('/app/dashboard')
    router.refresh()
  }

  const trans = (delay = 0, dur = 700) =>
    `opacity ${dur}ms ${delay}ms cubic-bezier(.4,0,.2,1), transform ${dur}ms ${delay}ms cubic-bezier(.4,0,.2,1)`
  const ent = (delay = 0, dur = 700): React.CSSProperties => ({
    opacity: on ? 1 : 0,
    transform: on ? 'translateY(0)' : 'translateY(22px)',
    transition: trans(delay, dur),
  })

  return (
    <div className={manrope.className} style={{ backgroundColor: '#080F1A', color: '#D4DCE8', minHeight: '100vh' }}>
      <ForceLightTheme />

      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes pf-sweep {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(300%)  skewX(-15deg); }
        }
        @keyframes pf-coord { 0%,100%{opacity:.04} 55%{opacity:.11} }
        @keyframes pf-gantt { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes pf-fade  { from{opacity:0} to{opacity:1} }
        @keyframes pf-blink { 0%,100%{opacity:.5} 50%{opacity:1} }
      `}</style>

      {/* ════════════════════════════════════════════════════
          NAV
      ════════════════════════════════════════════════════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(8,15,26,0.88)',
        backdropFilter: 'blur(16px)',
      }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div style={{ opacity: on ? 1 : 0, transition: 'opacity 600ms ease' }}>
            <GantticLogo variant="lockup" width={188} priority alt="PhaseForge" />
          </div>
          <div className="hidden items-center gap-8 md:flex" style={{ fontSize: '13px', color: '#6B8099' }}>
            {[['#capabilities', 'Capabilities'], ['#timeline', 'Timeline'], ['#signin', 'Sign in']].map(([href, label]) => (
              <a key={href} href={href}
                style={{ transition: 'color 200ms' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#E8EDF2')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6B8099')}>
                {label}
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', ...ent(200, 500) }}>
            <a href="#signin" style={{
              fontSize: '13px', color: '#8A9BB0', padding: '8px 16px',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px',
              transition: 'border-color 200ms, color 200ms', display: 'none',
            }}
              className="sm:block"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.22)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = '#8A9BB0' }}>
              Sign in
            </a>
            <Link href="/signup" style={{
              fontSize: '13px', fontWeight: 600, color: '#fff',
              padding: '9px 20px', borderRadius: '7px',
              background: 'linear-gradient(135deg, #D8891C 0%, #A86210 100%)',
              boxShadow: '0 2px 18px rgba(216,137,28,0.28)',
              transition: 'transform 180ms, box-shadow 180ms',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 28px rgba(216,137,28,0.45)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 18px rgba(216,137,28,0.28)' }}>
              Start Building
            </Link>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', overflow: 'hidden', paddingTop: '96px' }}>

        {/* Blueprint grid */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .10, pointerEvents: 'none' }}>
          <defs>
            <pattern id="pg" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M80 0L0 0 0 80" fill="none" stroke="#1B4070" strokeWidth=".5" />
              <path d="M20 0v80M40 0v80M60 0v80M0 20h80M0 40h80M0 60h80" fill="none" stroke="#1B4070" strokeWidth=".2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#pg)" />
        </svg>

        {/* Blueprint structural lines */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: .22 }}>
          <line x1="0" y1="22%" x2="100%" y2="22%"
            stroke="#1E5A9C" strokeWidth=".5"
            strokeDasharray="2400" strokeDashoffset={on ? 0 : 2400}
            style={{ transition: 'stroke-dashoffset 3.2s cubic-bezier(.4,0,.2,1) 0.1s' }} />
          <line x1="0" y1="78%" x2="60%" y2="78%"
            stroke="#1E5A9C" strokeWidth=".35"
            strokeDasharray="1400" strokeDashoffset={on ? 0 : 1400}
            style={{ transition: 'stroke-dashoffset 2.6s cubic-bezier(.4,0,.2,1) 0.4s' }} />
        </svg>

        {/* Coordinate ghost text */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none',
          fontFamily: 'monospace', fontSize: '10px', color: '#1A3A5C',
          animation: 'pf-coord 10s ease-in-out infinite',
        }}>
          <span style={{ position: 'absolute', left: '3%',  top: '21%' }}>X:0240</span>
          <span style={{ position: 'absolute', right: '4%', top: '21%' }}>Y:0180</span>
          <span style={{ position: 'absolute', left: '3%',  top: '79%' }}>REF:A1</span>
        </div>

        {/* Very slow light sweep */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '22%',
            background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.010), transparent)',
            animation: 'pf-sweep 16s 2s cubic-bezier(.4,0,.6,1) infinite',
          }} />
        </div>

        {/* ── Centered text block ── */}
        <div className="relative mx-auto max-w-4xl px-6 text-center" style={{ paddingBottom: '64px' }}>

          {/* Eyebrow */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginBottom: '32px', ...ent(0, 600) }}>
            <div style={{ height: '1px', width: '20px', backgroundColor: '#D8891C' }} />
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#D8891C', letterSpacing: '0.20em' }}>
              CONSTRUCTION PROJECT MANAGEMENT
            </span>
            <div style={{ height: '1px', width: '20px', backgroundColor: '#D8891C' }} />
          </div>

          {/* Headline */}
          <h1 className={sora.className} style={{
            fontSize: 'clamp(3.2rem, 6vw, 5.6rem)',
            fontWeight: 800, lineHeight: 0.96,
            letterSpacing: '-0.025em',
            color: '#EEF2F7',
            ...ent(150, 850),
          }}>
            WHERE PLANS<br />
            <span style={{ color: '#F2B94B' }}>BECOME</span><br />
            PROGRESS
          </h1>

          {/* Sub */}
          <p style={{
            marginTop: '28px', fontSize: '17px', lineHeight: 1.75,
            color: '#7A90A8', fontWeight: 300, maxWidth: '500px',
            marginLeft: 'auto', marginRight: 'auto',
            ...ent(350, 700),
          }}>
            Project scheduling, field punch lists, and team dispatch —
            built for construction, not adapted from it.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '40px', justifyContent: 'center', ...ent(550, 600) }}>
            <Link href="/signup" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              padding: '15px 30px', borderRadius: '8px', fontSize: '15px', fontWeight: 600,
              background: 'linear-gradient(135deg, #D8891C 0%, #A86210 100%)',
              boxShadow: '0 4px 28px rgba(216,137,28,0.32), inset 0 1px 0 rgba(255,255,255,0.12)',
              color: '#fff', textDecoration: 'none',
              transition: 'transform 180ms, box-shadow 180ms',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 40px rgba(216,137,28,0.5), inset 0 1px 0 rgba(255,255,255,0.12)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 28px rgba(216,137,28,0.32), inset 0 1px 0 rgba(255,255,255,0.12)' }}>
              Start Building
              <ArrowRight size={17} />
            </Link>
            <a href="#signin" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              padding: '15px 28px', borderRadius: '8px', fontSize: '15px', fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.13)', color: '#A8B8CC',
              textDecoration: 'none', transition: 'border-color 200ms, color 200ms',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.28)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.13)'; (e.currentTarget as HTMLElement).style.color = '#A8B8CC' }}>
              Sign in
            </a>
          </div>
        </div>

        {/* ── Product screenshot — rises from below CTAs ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1200px', margin: '0 auto', padding: '0 32px',
          opacity: on ? 1 : 0,
          transform: on ? 'translateY(0)' : 'translateY(40px)',
          transition: 'opacity 1100ms 650ms cubic-bezier(.4,0,.2,1), transform 1100ms 650ms cubic-bezier(.4,0,.2,1)',
        }}>
          {/* Glow behind image */}
          <div style={{
            position: 'absolute', left: '10%', right: '10%', bottom: '0', height: '40%',
            background: 'radial-gradient(ellipse at center bottom, rgba(216,137,28,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            borderRadius: '14px 14px 0 0',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.09)',
            borderBottom: 'none',
            boxShadow: '0 -8px 60px rgba(0,0,0,0.5), 0 -2px 0 rgba(255,255,255,0.05)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/login-bg.png"
              alt="PhaseForge — where plans become progress"
              style={{ width: '100%', display: 'block' }}
            />
          </div>
        </div>

        {/* Fade bottom of image into next section */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '220px',
          background: 'linear-gradient(to bottom, transparent 0%, rgba(8,15,26,0.7) 60%, #080F1A 100%)',
          pointerEvents: 'none', zIndex: 2,
        }} />

      </section>

      {/* ════════════════════════════════════════════════════
          CAPABILITIES
      ════════════════════════════════════════════════════ */}
      <section id="capabilities" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
        <div className="mx-auto max-w-7xl px-6">
          {/* Section label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '64px' }}>
            <div style={{ height: '1px', width: '28px', backgroundColor: '#D8891C' }} />
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#D8891C', letterSpacing: '0.18em' }}>CAPABILITIES</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#2D4458' }}>01 — 06</span>
          </div>

          {/* Engineering panel list */}
          <div ref={capsRef}>
            {CAPS.map(({ n, tag, title, body, specs }, i) => (
              <div key={n} style={{
                display: 'grid', gridTemplateColumns: '100px 1fr 220px', gap: '32px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                padding: '32px 0',
                opacity: capsOn ? 1 : 0,
                transform: capsOn ? 'translateY(0)' : 'translateY(18px)',
                transition: `opacity 600ms ${i * 75}ms cubic-bezier(.4,0,.2,1), transform 600ms ${i * 75}ms cubic-bezier(.4,0,.2,1)`,
              }}>
                {/* Number */}
                <div>
                  <p className={sora.className} style={{ fontSize: '42px', fontWeight: 800, color: 'rgba(255,255,255,0.05)', lineHeight: 1 }}>{n}</p>
                  <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#D8891C', letterSpacing: '0.16em', marginTop: '6px' }}>{tag}</p>
                </div>
                {/* Title + body */}
                <div>
                  <h3 className={sora.className} style={{ fontSize: '19px', fontWeight: 700, color: '#EEF2F7', marginBottom: '12px' }}>{title}</h3>
                  <p style={{ fontSize: '14px', lineHeight: 1.75, color: '#6B8099' }}>{body}</p>
                </div>
                {/* Specs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                  {specs.map(s => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '18px', height: '1px', backgroundColor: '#D8891C', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#5A7590' }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          GANTT DEMO
      ════════════════════════════════════════════════════ */}
      <section id="timeline" style={{ backgroundColor: '#060C14', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '96px 0' }}>
        <div className="mx-auto max-w-7xl px-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '48px' }}>
            <div style={{ height: '1px', width: '28px', backgroundColor: '#D8891C' }} />
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#D8891C', letterSpacing: '0.18em' }}>TIMELINE DEMO</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'end', marginBottom: '40px' }}>
            <h2 className={sora.className} style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 800, color: '#EEF2F7', lineHeight: 1.1 }}>
              Complete schedule<br />visibility, from day one.
            </h2>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: '#6B8099' }}>
              Every phase, milestone, and dependency visible in a single synchronized Gantt. Drag to reschedule. Click to drill in. Updates reflect instantly across the whole team.
            </p>
          </div>

          {/* Gantt panel */}
          <div ref={ganttRef} style={{
            backgroundColor: '#0A1320',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            padding: '28px',
            overflow: 'hidden',
          }}>
            {/* Month row */}
            <div style={{ display: 'flex', paddingLeft: '200px', marginBottom: '14px' }}>
              {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT'].map(m => (
                <div key={m} style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontSize: '9px', color: '#2A4060', letterSpacing: '0.12em' }}>{m}</div>
              ))}
            </div>

            {/* Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {GANTT.map(({ label, s, w, pct, done }, i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ flexShrink: 0, width: '200px', paddingRight: '16px' }}>
                    <p style={{ fontFamily: 'monospace', fontSize: '11px', color: done ? '#8A9BB0' : '#566880', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</p>
                  </div>
                  <div style={{ flex: 1, position: 'relative', height: '22px' }}>
                    {/* Track */}
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '3px' }} />
                    {/* Bar */}
                    <div style={{
                      position: 'absolute', left: `${s}%`, width: `${w}%`, height: '100%',
                      borderRadius: '3px', transformOrigin: 'left',
                      transform: ganttOn ? 'scaleX(1)' : 'scaleX(0)',
                      transition: `transform 900ms ${200 + i * 110}ms cubic-bezier(.4,0,.2,1)`,
                      background: done
                        ? '#D8891C'
                        : pct > 0
                          ? `linear-gradient(to right, #D8891C ${pct}%, rgba(45,70,100,0.5) ${pct}%)`
                          : 'rgba(45,60,80,0.4)',
                    }} />
                    {/* Today marker */}
                    <div style={{
                      position: 'absolute', left: `${TODAY}%`, top: '-3px', bottom: '-3px',
                      width: '1px', backgroundColor: '#D8891C',
                      boxShadow: '0 0 10px rgba(216,137,28,0.6)',
                      opacity: ganttOn ? 1 : 0,
                      transition: 'opacity 400ms 900ms ease',
                    }} />
                  </div>
                  <div style={{ flexShrink: 0, width: '44px', textAlign: 'right', paddingLeft: '12px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: done ? '#D8891C' : pct > 0 ? '#F2B94B' : '#2D4060' }}>
                      {pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Today label */}
            <div style={{ position: 'relative', paddingLeft: '200px', marginTop: '8px' }}>
              <div style={{
                position: 'absolute',
                left: `calc(200px + ${TODAY}%)`,
                transform: 'translateX(-50%)',
                opacity: ganttOn ? 1 : 0,
                transition: 'opacity 400ms 900ms ease',
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: '9px', color: '#D8891C', letterSpacing: '0.12em', animation: 'pf-blink 2.5s ease-in-out infinite' }}>TODAY</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          SIGN IN
      ════════════════════════════════════════════════════ */}
      <section id="signin" style={{ padding: '96px 0' }}>
        <div className="mx-auto max-w-7xl px-6">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}>
            {/* Left */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
                <div style={{ height: '1px', width: '24px', backgroundColor: '#D8891C' }} />
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#D8891C', letterSpacing: '0.18em' }}>ACCESS</span>
              </div>
              <h2 className={sora.className} style={{ fontSize: 'clamp(2rem, 3vw, 2.8rem)', fontWeight: 800, color: '#EEF2F7', lineHeight: 1.1, marginBottom: '20px' }}>
                Sign in to<br />your workspace.
              </h2>
              <p style={{ fontSize: '14px', lineHeight: 1.8, color: '#6B8099', maxWidth: '360px', marginBottom: '36px' }}>
                Pick up exactly where you left off.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  ['Data encrypted at rest and in transit', 'Supabase-backed storage with row-level security'],
                  ['No per-seat fees on team plans',        'One flat rate per plan tier — no per-user billing'],
                  ['Works on desktop and mobile',           'Full-featured iOS and Android app available'],
                ].map(([t, s]) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ marginTop: '7px', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#D8891C', flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#C8D4E0' }}>{t}</p>
                      <p style={{ fontSize: '12px', marginTop: '2px', color: '#4A6070' }}>{s}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '13px', marginTop: '36px', color: '#4A6070' }}>
                No account?{' '}
                <Link href="/signup" style={{ color: '#D8891C', fontWeight: 600, textDecoration: 'none', transition: 'color 200ms' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#F2B94B')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#D8891C')}>
                  Start free — no card required.
                </Link>
              </p>
            </div>

            {/* Right: form */}
            <div style={{
              backgroundColor: '#0D1824',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '14px',
              padding: '40px',
            }}>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label htmlFor="email" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B8099', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: '8px' }}>Email</label>
                  <Input id="email" type="email" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    icon={<Mail size={16} />}
                    className="h-12 rounded-lg border-white/10 bg-white/5 pl-12 text-sm text-white placeholder:text-slate-600 focus:border-amber-600/40 focus:ring-amber-600/20"
                    required />
                </div>
                <div>
                  <label htmlFor="password" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B8099', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: '8px' }}>Password</label>
                  <Input id="password" type="password" placeholder="••••••••"
                    value={pass} onChange={e => setPass(e.target.value)}
                    icon={<Lock size={16} />}
                    className="h-12 rounded-lg border-white/10 bg-white/5 pl-12 text-sm text-white placeholder:text-slate-600 focus:border-amber-600/40 focus:ring-amber-600/20"
                    required />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <Link href="/forgot-password" style={{ fontSize: '12px', color: '#D8891C', textDecoration: 'none', transition: 'color 200ms' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#F2B94B')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#D8891C')}>
                      Forgot password?
                    </Link>
                  </div>
                </div>

                {error && (
                  <div style={{ backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#FCA5A5' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  height: '48px', padding: '0 20px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #D8891C, #A86210)',
                  boxShadow: '0 2px 18px rgba(216,137,28,0.22)',
                  fontSize: '14px', fontWeight: 600, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.65 : 1, border: 'none', width: '100%',
                  transition: 'transform 160ms, box-shadow 160ms',
                }}
                  onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 28px rgba(216,137,28,0.4)' } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 18px rgba(216,137,28,0.22)' }}>
                  <span style={{ width: '20px' }} />
                  <span>{loading ? 'Signing in…' : 'Sign in'}</span>
                  <ArrowRight size={17} style={{ transition: 'transform 160ms' }} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#050A10', padding: '40px 0' }}>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-6 sm:flex-row">
          <GantticLogo variant="lockup" width={148} alt="PhaseForge" />
          <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#1E3050', letterSpacing: '0.08em' }}>
            © 2026 PhaseForge · Built for serious construction.
          </p>
          <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: '#3A5070' }}>
            {[['Privacy', '/privacy'], ['Contact', 'mailto:customersupport@phase-forge.com'], ['Sign up', '/signup']].map(([l, h]) => (
              <a key={l} href={h} style={{ textDecoration: 'none', color: '#3A5070', transition: 'color 200ms' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#8A9BB0')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#3A5070')}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
