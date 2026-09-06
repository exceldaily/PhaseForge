'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { ArrowRight, Check, ChevronDown, Lock, Mail, Menu, X } from 'lucide-react'
import { SALES_EMAIL } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { GantticLogo } from '@/components/branding/GantticLogo'
import { ForceLightTheme } from '@/components/layout/ForceLightTheme'
import { getFriendlyAuthError, normalizeAuthEmail } from '@/lib/auth/password'
import { FirstVisitHero } from './ProjectPreview'
import { WorkflowExplorer } from './WorkflowExplorer'
import styles from './landing.module.css'

const display = Archivo({ subsets: ['latin'], weight: ['600', '700', '800'] })
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'] })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'] })

const CAPS = [
  { n: '01', tag: 'SCHEDULE', title: 'Gantt Timeline', body: 'Every phase from mobilization to closeout on one screen. Drag a bar to move it, drag its edge to change the duration, and everything downstream shifts with it if you want it to. Zoom out to a quarter when the owner asks about the whole job. Push it all to Google Calendar so the field sees the same dates you do.', specs: ['Day, week, month and quarter views', 'Dependencies and milestones', 'Google Calendar sync'] },
  { n: '02', tag: 'DRAWINGS', title: 'Construction Plans', body: 'Drop in the whole set. It splits the pages, reads the title blocks, and gives you a drawing index you can actually navigate. Upload a revised sheet and the old one is superseded, not overwritten, so you can still see what changed and when.', specs: ['Sheet numbers and disciplines read automatically', 'Revision history with supersede warnings', 'Overlay compare, markups, pins'] },
  { n: '03', tag: 'CHANGE ORDERS', title: 'Change Order Control', body: 'Pricing, submission, approval, billing. One board, and at any moment you know who owns it on your side, who you are waiting on, how many days it has sat there, and whether it ever actually got submitted. That last one catches more money than the rest combined.', specs: ['Owner and waiting on, tracked separately', 'Portal confirmation numbers', 'Alerts on approved work you have not billed'] },
  { n: '04', tag: 'FIELD', title: 'Punch Lists', body: 'Log items on site with a photo, assign the trade, close them out from your phone. Already have a list in a PDF from the GC? Import it and the photos come across with it.', specs: ['Before and after photo pairs', 'Import from PDF or Excel', 'Printable field report'] },
  { n: '05', tag: 'CREW', title: 'Weekly Schedules', body: 'Build the week, then copy it into an email as a clean table your crews will actually read instead of squinting at a screenshot. Departments that work differently get a layout that fits how they work.', specs: ['A layout per department', 'One tap to copy for email', 'Job numbers link straight to your systems'] },
  { n: '06', tag: 'SERVICE', title: 'Dispatch and Quotes', body: 'Service calls on a live board with priorities, ETAs, and the on call rotation. Vendor quote requests go out from your own Gmail, not a noreply address nobody answers, and every reply lands back on the job.', specs: ['Call board with ETA alerts', 'RFQs from your own inbox', 'Replies tracked per request'] },
  { n: '07', tag: 'BOARDS', title: 'Project Boards', body: 'Columns named after your stages, not somebody else\'s idea of a workflow. Scope each board by team so the field sees field work and the office sees everything.', specs: ['Up to fifteen custom stages', 'Visibility scoped by team', 'Choose which fields show on a card'] },
  { n: '08', tag: 'REPORTING', title: 'Reports and Analytics', body: 'Portfolio dashboards and printable summaries for owner updates, bank draws, and the Monday morning review. Export to PDF straight from the browser.', specs: ['Print or PDF from the browser', 'Portfolio and completion tracking', 'Access scoped by role'] },
]

// Business Plus has no price to check out with, so the card writes an email.
// Prefilled subject and opener so a reply is not starting from nothing.
const PLUS_MAILTO = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Business Plus enquiry')}` +
  `&body=${encodeURIComponent([
    'We are looking at Business Plus.',
    '',
    'Company:',
    'Roughly how many people:',
    'What we would want built around how we work:',
    '',
  ].join(String.fromCharCode(10)))}`

const TIERS = [
  { name: 'Free',       price: '$0',      unit: '',         who: 'Kicking the tires',        points: ['1 board', '5 projects', '3 people'] },
  { name: 'Individual', price: '$3',      unit: '/mo',      who: 'One person, own jobs',     points: ['10 boards', 'Unlimited projects', 'Schedules and calendar sync'] },
  { name: 'Pro',        price: '$49',     unit: '/mo',      who: 'A growing crew',           points: ['Up to 25 people', 'Everything in Individual', 'Print and reports'], popular: true },
  { name: 'Business',   price: '$199',    unit: '/mo',      who: 'The whole company',        points: ['Unlimited people', 'Trade and division filters', 'Priority support'] },
  { name: 'Business Plus', price: "Let's talk", unit: '',   who: 'Built around your process', contact: true,
    points: ['Everything in Business', 'Fields, stages and forms built to your process', 'Your terminology, your integrations', 'Onboarding for your crews'] },
]




const FAQS = [
  ['Where should I start?', 'Start free, check your default board, and add your first project. Break it into phases, set dates, then invite your team. The in-app Guide walks you through each step.'],
  ['Can I bring in an existing schedule?', 'Yes. Import Schedule on the Projects page accepts an Excel workbook. Each tab becomes a project with its phases. You can also add projects and phases individually.'],
  ['Is this only for project managers?', 'No. PhaseForge brings together project managers, field crews, trade contractors, and service teams. Roles, team visibility, and optional operations modules help each person find the work that matters to them.'],
  ['Do you charge for each person?', 'Plans use a fixed monthly rate with the member limits shown in the pricing section. Free includes 3 people, Pro includes up to 25, and Business includes unlimited people. Choose the tier that fits your team.'],
  ['Can PhaseForge fit our existing process?', 'Use boards, stages, team visibility, and enabled modules to organize your work. For company-specific fields, forms, integrations, and onboarding, contact us about Business Plus.'],
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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



  const links = [['#capabilities', 'Platform'], ['#workflow', 'How it works'], ['#pricing', 'Pricing']]

  return (
    <div className={`${body.className} ${styles.page}`} style={{ '--pf-mono': mono.style.fontFamily, '--pf-display': display.style.fontFamily } as React.CSSProperties}>
      <ForceLightTheme />
      <a href="#welcome-title" className={styles.skipLink}>Skip to content</a>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main navigation">
          <Link href="/login" aria-label="PhaseForge home" className={styles.logo}><GantticLogo variant="lockup" width={188} priority alt="PhaseForge" /></Link>
          <div className={styles.desktopLinks}>{links.map(([href, label]) => <a href={href} key={href}>{label}</a>)}</div>
          <div className={styles.navActions}><a href="#signin" className={styles.signinLink} onClick={() => setMenuOpen(false)}>Sign in</a><Link href="/signup" className={styles.primary}>Start free <ArrowRight size={15} /></Link><button className={styles.menuToggle} aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button></div>
        </nav>
        {menuOpen && <nav className={styles.mobileNav} id="mobile-navigation" aria-label="Mobile navigation">{links.map(([href, label]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}<ArrowRight size={16} /></a>)}</nav>}
      </header>
      <main>
        <FirstVisitHero headingClass={display.className} />
        <section className={styles.capabilities} id="capabilities" aria-labelledby="capabilities-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>01 / THE WHOLE JOB, IN VIEW</p><h2 id="capabilities-title">Every detail has a place.<br /><em>Every team has a way forward.</em></h2></div><p>Follow the schedule. Find the current drawing. Know who owns the next step. Get the depth your jobs demand, with a clear place to start.</p></div>
            <div className={styles.featureGrid}>
              {[CAPS.slice(0, 4), CAPS.slice(4)].map((group, column) => (
                <div key={column} className={styles.featureColumn}>
                  {group.map(({ n, tag, title, body: copy, specs }) => (
                    <details key={n} className={styles.feature} open={n === '01' || n === '05' ? true : undefined}>
                      <summary>
                        <span className={styles.featureNumber}>{n}</span>
                        <h3><span className={styles.featureTag}>{tag}</span>{title}</h3>
                        <ChevronDown size={20} />
                      </summary>
                      <div className={styles.featureBody}>
                        <p>{copy}</p>
                        <ul>{specs.map(s => <li key={s}><Check size={15} />{s}</li>)}</ul>
                      </div>
                    </details>
                  ))}
                </div>
              ))}
            </div>
            <div className={styles.sectionAside}><span>BUILT AROUND THE JOB</span><p>Schedules → drawings → field updates → closeout.<br />Keep the work and its context together.</p><a href="#workflow">Follow the workflow <ArrowRight size={17} /></a></div>
          </div>
        </section>
        <WorkflowExplorer />
        <section className={styles.gettingStarted} aria-labelledby="start-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>03 / YOUR FIRST DAY IN PHASEFORGE</p><h2 id="start-title">Start with one job.<br /><em>Build from there.</em></h2></div><p>You do not need to reorganize your whole company to get started. Bring one project, make the next steps clear, and invite the people doing the work.</p></div>
            <div className={styles.startSteps}>{[
              ['01', 'Make it your workspace', 'Start free and check your default board. Use boards to organize jobs by division, client, or type of work.'],
              ['02', 'Put the plan in motion', 'Add a project and its phases, or import an Excel schedule. Set the dates and milestones that matter.'],
              ['03', 'Bring your people in', 'Invite teammates, choose their roles, and give the field and office a shared place to follow progress.'],
            ].map(([n,title,copy]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
            <Link href="/signup" className={styles.primary}>Create your free workspace <ArrowRight size={17} /></Link>
          </div>
        </section>
        <section className={styles.pricing} id="pricing" aria-labelledby="pricing-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>04 / ROOM TO GROW</p><h2 id="pricing-title">A plan for your next phase.</h2></div><p>Start free. Move up when your projects and team need more. A fixed price per tier, with clear member limits.</p></div>
            <div className={styles.tiers}>{TIERS.map(t => <article key={t.name} className={`${styles.tier} ${t.popular ? styles.featuredTier : ''}`}>
              {t.popular && <span className={styles.tierBadge}>FOR GROWING TEAMS</span>}
              <h3>{t.name}</h3><p className={styles.tierWho}>{t.who}</p><p className={styles.price}>{t.price}<span>{t.unit}</span></p>
              <ul>{t.points.map(p => <li key={p}><Check size={15} />{p}</li>)}</ul>
              {t.contact ? <a href={PLUS_MAILTO} className={styles.secondary}>Let’s talk <Mail size={15} /></a> : <Link href="/signup" className={t.popular ? styles.primary : styles.secondary}>Start free <ArrowRight size={15} /></Link>}
            </article>)}</div>
            <p className={styles.pricingNote}>Business Plus is scoped and quoted per company. <a href={PLUS_MAILTO}>Tell us how you run your jobs.</a></p>
          </div>
        </section>
        <section className={styles.faqSection} aria-labelledby="faq-title"><div className={styles.sectionInner}><div className={styles.faqLayout}><div><p className={styles.eyebrow}>BEFORE YOU BUILD</p><h2 id="faq-title">A few things<br />worth knowing.</h2><p>Have something specific in mind?<br /><a href={`mailto:${SALES_EMAIL}`}>Talk to us <ArrowRight size={15} /></a></p></div><div className={styles.faqs}>{FAQS.map(([q,a]) => <details key={q}><summary>{q}<ChevronDown size={18} /></summary><p>{a}</p></details>)}</div></div></div></section>
        <section className={styles.finalCta}><div className={styles.sectionInner}><p className={styles.eyebrow}>YOUR NEXT PROJECT STARTS HERE</p><h2>Build with clarity.<br /><em>Deliver with control.</em></h2><p>Your plans. Your people. Your progress.<br />Bring them together in PhaseForge.</p><div className={styles.actions}><Link href="/signup" className={styles.primary}>Start building free <ArrowRight size={18} /></Link><a href="#signin" className={styles.secondary}>Already a member? Sign in</a></div></div></section>
        <section className={styles.signinSection} id="signin" aria-labelledby="signin-title"><div className={styles.sectionInner}><div className={styles.signinGrid}>
          <div><p className={styles.eyebrow}>WELCOME BACK</p><h2 id="signin-title">Your workspace.<br />Ready when you are.</h2><p>Sign in to pick up the plan, check the next handoff, and keep your projects moving.</p><Link href="/forgot-password" className={styles.textLink}>Need to reset your password? <ArrowRight size={16} /></Link></div>
          <form onSubmit={handleLogin} className={styles.loginForm}>
            <h3>Sign in to PhaseForge</h3>
            <div><label htmlFor="email">Email</label><Input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} icon={<Mail size={16} />} className="h-12 rounded-lg border-white/20 bg-white/5 pl-12 text-base text-white placeholder:text-slate-400 focus:border-amber-400 focus:ring-amber-400/20" required /></div>
            <div><label htmlFor="password">Password</label><Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} icon={<Lock size={16} />} className="h-12 rounded-lg border-white/20 bg-white/5 pl-12 text-base text-white placeholder:text-slate-400 focus:border-amber-400 focus:ring-amber-400/20" required /></div>
            <Link href="/forgot-password" className={styles.forgot}>Forgot password?</Link>
            {error && <div role="alert" className={styles.authError}>{error}</div>}
            <button type="submit" disabled={loading} className={styles.primary}>{loading ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button>
            <p>New here? <Link href="/signup">Start free. No card required.</Link></p>
          </form>
        </div></div></section>
      </main>
      <footer className={styles.footer}><div className={styles.sectionInner}><GantticLogo variant="lockup" width={150} alt="PhaseForge" /><p>© 2026 PhaseForge. Built for the work ahead.</p><div><Link href="/privacy">Privacy</Link><a href={`mailto:${SALES_EMAIL}`}>Contact</a><Link href="/signup">Sign up</Link></div></div></footer>
    </div>
  )
}
