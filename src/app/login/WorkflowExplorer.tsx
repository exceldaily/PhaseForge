'use client'

import { useState } from 'react'
import { ArrowRight, Check, ClipboardCheck, Flag, HardHat, Layers3, Users } from 'lucide-react'
import styles from './landing.module.css'

const STEPS = [
  { name: 'Plan', icon: Layers3, title: 'Give every phase a place.', body: 'Start with the scope, set your dates, and connect the work that depends on what comes before it. Drawings and project records stay with the job.', input: 'Scope + drawings', output: 'A schedule the team can follow', items: ['Define phases and milestones', 'Set dependencies and dates', 'Organize the current drawing set'], context: 'Before mobilization', example: 'Foundations → steel → MEP', note: 'A clear sequence makes the next handoff visible.' },
  { name: 'Coordinate', icon: Users, title: 'Put the right people on the next move.', body: 'Translate the plan into the week ahead. Assign crews, organize work by team, and keep service calls visible alongside construction work.', input: 'Project schedule', output: 'Clear assignments for the week', items: ['Build weekly crew schedules', 'Scope boards by team', 'Track service priorities and ETAs'], context: 'The weekly lookahead', example: 'MEP rough-in → mechanical crew', note: 'The assignment, trade, and project stay connected.' },
  { name: 'Execute', icon: HardHat, title: 'Keep the office close to the field.', body: 'Record progress where the work happens. Use project updates, photos, and change orders to keep decisions grounded in what is actually happening on site.', input: 'Assigned work', output: 'Progress with the context attached', items: ['Update phase progress', 'Keep photos with the project', 'Track scope changes through approval'], context: 'On the job', example: 'Rough-in progress → 45%', note: 'A specific update gives the office something to act on.' },
  { name: 'Verify', icon: ClipboardCheck, title: 'Make the last details count.', body: 'Walk the job, capture the remaining issues, and assign each item to the right trade. Keep before-and-after photos together so closeout is easy to review.', input: 'Work ready for review', output: 'A punch list with clear ownership', items: ['Capture issues with photos', 'Assign the responsible trade', 'Record completed corrections'], context: 'The final walk', example: 'Ceiling tile replacement → complete', note: 'The item, responsible trade, and evidence belong together.' },
  { name: 'Close out', icon: Flag, title: 'Finish with a record you can stand behind.', body: 'Bring completed work, documentation, and reporting together. Give the owner a clear summary and keep track of approved work that still needs billing.', input: 'Verified work', output: 'An organized handover', items: ['Review outstanding change orders', 'Prepare printable project reports', 'Keep closeout documents on the job'], context: 'Ready for handover', example: 'Completed work → project report', note: 'The handover reflects the work that was actually delivered.' },
]

export function WorkflowExplorer() {
  const [active, setActive] = useState(0)
  const step = STEPS[active]
  const Icon = step.icon
  return <section className={styles.workflowSection} id="workflow" aria-labelledby="workflow-title">
    <div className={styles.sectionInner}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>02 / THE CONNECTED JOB</p><h2 id="workflow-title">From the first plan.<br /><em>Through the final detail.</em></h2></div><p>A construction project is a chain of handoffs. Explore how PhaseForge helps each team keep the next one moving.</p></div>
      <div className={styles.stepControls} aria-label="Explore the project workflow">{STEPS.map((s, i) => <button key={s.name} type="button" aria-pressed={i === active} aria-controls="workflow-detail" onClick={() => setActive(i)} className={i === active ? styles.activeStep : ''}><span>{String(i + 1).padStart(2, '0')}</span><s.icon size={19} />{s.name}<ArrowRight size={15} /></button>)}</div>
      <div className={styles.workflowDetail} id="workflow-detail" aria-live="polite" aria-atomic="true">
        <div className={styles.workflowCopy}><span className={styles.micro}>PHASE {String(active + 1).padStart(2, '0')} / {step.name.toUpperCase()}</span><h3>{step.title}</h3><p>{step.body}</p><ul>{step.items.map(item => <li key={item}><Check size={16} />{item}</li>)}</ul></div>
        <div className={styles.flowDiagram} key={active}>
          <p className={styles.micro}>ILLUSTRATIVE WORKFLOW</p>
          <div className={styles.flowInput}>{step.input}</div><div className={styles.flowLink} aria-hidden="true" />
          <div className={styles.flowNode}><Icon size={23} /><div><span>{step.context}</span><strong>{step.example}</strong></div></div>
          <div className={styles.flowLink} aria-hidden="true" /><div className={styles.flowOutput}><Check size={16} />{step.output}</div><p className={styles.flowNote}>{step.note}</p>
        </div>
      </div>
    </div>
  </section>
}
