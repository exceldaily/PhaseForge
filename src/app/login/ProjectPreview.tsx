'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowDown, ArrowRight, Check, CheckCheck, CircleDot, Layers3, ListChecks, Pause, Play, Radio, Route, Users } from 'lucide-react'
import styles from './landing.module.css'

const PHASES = [
  { name: 'Mobilization', trade: 'Site crew', start: 0, width: 18, progress: 100, detail: 'Site access established. Equipment and temporary facilities are in place.', next: 'Foundation work', status: 'Complete' },
  { name: 'Foundations', trade: 'Concrete', start: 13, width: 26, progress: 100, detail: 'Footings and slab are complete. The structural crew has a clear handoff.', next: 'Steel framework', status: 'Complete' },
  { name: 'Steel framework', trade: 'Structural', start: 32, width: 30, progress: 78, detail: 'Main framing is in place. The team is finishing connections before the next inspection.', next: 'MEP rough-in', status: 'In progress' },
  { name: 'MEP rough-in', trade: 'Mechanical / electrical', start: 49, width: 27, progress: 45, detail: 'Coordinate ductwork, conduit, and piping before walls close. Keep trade handoffs visible.', next: 'Interior finishes', status: 'In progress' },
  { name: 'Interior finishes', trade: 'Finishing crew', start: 68, width: 25, progress: 0, detail: 'Finishes follow rough-in inspections. Confirm the release date before committing the crew.', next: 'Final inspection', status: 'Upcoming' },
]

export function ProjectPreview() {
  const [selected, setSelected] = useState(2)
  const phase = PHASES[selected]

  return (
    <div className={styles.console} id="project-preview">
      <div className={styles.consoleBar}><span><CircleDot size={15} /> PROJECT EXPLORER</span><span className={styles.sample}>SAMPLE PROJECT</span></div>
      <div className={styles.consoleHeading}>
        <div><p className={styles.micro}>COMMERCIAL / PF–024</p><h2>Northline medical center</h2><p>One project. Every moving part.</p></div>
        <span className={styles.projectStatus}><span /> In construction</span>
      </div>
      <div className={styles.consoleMetrics}>
        <div><Layers3 size={17} /><span><strong>05</strong> project phases</span></div>
        <div><Users size={17} /><span><strong>05</strong> trade teams</span></div>
        <div><CheckCheck size={17} /><span><strong>02</strong> phases complete</span></div>
      </div>
      <div className={styles.schedule}>
        <div className={styles.scheduleHeading}><span><Route size={16} /> Construction schedule</span><span>SELECT A PHASE ↓</span></div>
        <div className={styles.months} aria-hidden="true"><span /><div>{['JUN', 'JUL', 'AUG', 'SEP', 'OCT'].map(m => <span key={m}>{m}</span>)}</div></div>
        <div className={styles.phaseRows}>
          {PHASES.map((p, i) => <button key={p.name} type="button" className={`${styles.phaseRow} ${selected === i ? styles.phaseSelected : ''}`} onClick={() => setSelected(i)} aria-pressed={selected === i} aria-controls="phase-detail">
            <span className={styles.phaseName}><span>{String(i + 1).padStart(2, '0')}</span>{p.name}</span>
            <span className={styles.track}><span className={styles.bar} style={{ left: `${p.start}%`, width: `${p.width}%`, animationDelay: `${i * 100}ms` }}><span style={{ width: `${p.progress}%` }} />{p.progress === 100 ? <Check size={12} /> : null}</span></span>
            <span className={styles.phasePercent}>{p.progress}%</span>
          </button>)}
        </div>
      </div>
      <div className={styles.phaseDetail} id="phase-detail" aria-live="polite" aria-atomic="true">
        <div><span className={styles.micro}>PHASE {String(selected + 1).padStart(2, '0')} / {phase.status.toUpperCase()}</span><h3>{phase.name}</h3><p>{phase.detail}</p></div>
        <div className={styles.handoff}><span>{phase.trade}</span><ArrowDown size={16} /><strong>Next: {phase.next}</strong></div>
      </div>
      <div className={styles.consoleFoot}><span><Radio size={14} /> Explore the handoffs before you sign up.</span><span>Demo data</span></div>
    </div>
  )
}

export function FirstVisitHero({ headingClass }: { headingClass: string }) {
  const [paused, setPaused] = useState(false)
  return <section className={`${styles.hero} ${paused ? styles.paused : ''}`} aria-labelledby="welcome-title">
    <div className={styles.scan} aria-hidden="true" />
    <div className={styles.heroTop}><span className={styles.micro}>THE CONSTRUCTION OPERATING PLATFORM</span><button className={styles.motionToggle} onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? 'Resume motion' : 'Pause motion'}</button></div>
    <div className={styles.heroGrid}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><span /> BUILT FOR THE WAY YOU BUILD</p>
        <h1 className={headingClass} id="welcome-title" tabIndex={-1}>Big plans.<br />Moving parts.<br /><em>One clear view.</em></h1>
        <p className={styles.heroIntro}>Bring the job together. Schedules, drawings, crews, and change orders — connected from the first plan to the final punch.</p>
        <div className={styles.actions}><Link href="/signup" className={styles.primary}>Start building free <ArrowRight size={18} /></Link><a href="#capabilities" className={styles.secondary}>Explore the platform <ArrowDown size={16} /></a></div>
        <p className={styles.reassurance}><Check size={15} /> No card required <span>·</span> Start with your first project</p>
        <div className={styles.heroNote}><span>01 / PLAN → BUILD → DELIVER</span><p>Less chasing updates.<br /><strong>More moving the job forward.</strong></p></div>
      </div>
      <div className={styles.heroVisual} id="timeline"><ProjectPreview /><div className={styles.connected}><span><ListChecks size={16} /> Field to office</span><i aria-hidden="true" /><span>All part of the same job <Check size={16} /></span></div></div>
    </div>
    <div className={styles.disciplineStrip}><span>YOUR JOB, CONNECTED</span>{['Project managers', 'Field crews', 'Trade contractors', 'Service teams'].map(t => <span key={t}><span className={styles.plus}>+</span>{t}</span>)}</div>
  </section>
}
