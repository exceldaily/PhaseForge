'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, CheckCircle2, AlertTriangle, Plus, Pencil, HardHat, Tag } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { GOOGLE_EVENT_COLORS, nearestGoogleColorId } from '@/lib/scheduling/calendarEvent'
import { timeAgo } from '@/components/operations/shared'
import {
  listCalendars, setTargetCalendar, setRoutingMode, disconnectGoogle,
  saveSuperintendent, saveScheduleLabel, resolvePendingChange,
} from './actions'

interface Connection {
  id: string; account_email: string | null
  target_calendar_id: string | null; target_calendar_name: string | null
  routing_mode: string; is_active: boolean
  last_sync_at: string | null; last_success_at: string | null; last_error: string | null
}
interface Superintendent {
  id: string; name: string; email: string | null; phone: string | null
  gcal_email: string | null; gcal_calendar_id: string | null
  default_label_ids: string[]; is_active: boolean; notes: string | null
}
interface SchLabel {
  id: string; name: string; color: string
  gcal_calendar_id: string | null; gcal_color_id: string | null
  gcal_attendee_email: string | null; superintendent_id: string | null; is_active: boolean
}

interface PendingChange {
  id: string
  changeType: string
  gcalValue: Record<string, string>
  createdAt: string
  phaseName: string | null
  projectName: string | null
}

export function SchedulingClient({ configured, connection, superintendents, labels, pendingChanges = [] }: {
  configured: boolean
  connection: Connection | null
  superintendents: Superintendent[]
  labels: SchLabel[]
  pendingChanges?: PendingChange[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [calendars, setCalendars] = useState<{ id: string; name: string; primary: boolean }[] | null>(null)
  const [error, setError] = useState<string | null>(params.get('error'))
  const [editSup, setEditSup] = useState<Superintendent | 'new' | null>(null)
  const [editLabel, setEditLabel] = useState<SchLabel | 'new' | null>(null)

  const connected = Boolean(connection?.is_active)

  async function loadCalendars() {
    setError(null)
    const res = await listCalendars()
    if ('error' in res && res.error) setError(res.error)
    else if ('calendars' in res && res.calendars) setCalendars(res.calendars)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Scheduling</h1>
        <p className="text-sm text-slate-500">Google Calendar connection, superintendents, and SCH schedule labels.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {params.get('connected') && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Google account connected. Now pick your target calendar below.
        </div>
      )}

      {/* ── Guided setup — shown until every step is done ── */}
      {configured && !(connected && connection?.target_calendar_id && superintendents.length > 0 && labels.length > 0) && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
          <h2 className="mb-1 text-sm font-semibold text-indigo-900 dark:text-indigo-200">Set up calendar scheduling</h2>
          <p className="mb-4 text-xs text-indigo-700/70 dark:text-indigo-300/70">
            Four quick steps — each one takes under a minute. Your calendar is never written to until you finish step 2, and only the calendar you pick is ever touched.
          </p>
          <ol className="space-y-2">
            <SetupStep
              n={1}
              done={connected}
              label="Connect your company's Google account"
              hint="Any Google account with access to your schedule calendar"
              action={!connected ? <a href="/api/google/oauth/start"><Button size="sm">Connect Google</Button></a> : null}
            />
            <SetupStep
              n={2}
              done={Boolean(connected && connection?.target_calendar_id)}
              label="Choose which calendar PhaseForge writes to"
              hint="Use a dedicated schedule calendar — not someone's personal one"
              action={connected && !connection?.target_calendar_id ? <Button size="sm" variant="outline" onClick={loadCalendars}>Pick calendar</Button> : null}
            />
            <SetupStep
              n={3}
              done={superintendents.length > 0}
              label="Add your superintendents"
              hint="Field leads you assign to projects and phases"
              action={superintendents.length === 0 ? <Button size="sm" variant="outline" onClick={() => setEditSup('new')}>Add one</Button> : null}
            />
            <SetupStep
              n={4}
              done={labels.length > 0}
              label="Create your SCH schedule labels"
              hint='e.g. "SCH - John Smith" — maps to event colors, calendars, and invites'
              action={labels.length === 0 ? <Button size="sm" variant="outline" onClick={() => setEditLabel('new')}>Add one</Button> : null}
            />
          </ol>
        </section>
      )}

      {/* ── Google Calendar connection ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Calendar size={16} className="text-indigo-500" /> Google Calendar
        </h2>

        {!configured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Google Cloud credentials not configured.</p>
            <p className="mt-1">Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and <code>GOOGLE_TOKEN_ENC_KEY</code> in the environment, then reload. See GOOGLE_CALENDAR_SETUP.md in the repo for the exact Google Cloud Console steps.</p>
          </div>
        ) : !connected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">No Google account connected for this organization.</p>
            <a href="/api/google/oauth/start">
              <Button>Connect Google Calendar</Button>
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 size={15} /> Connected as <span className="font-medium">{connection!.account_email ?? 'unknown'}</span>
              </span>
              {connection!.last_success_at && (
                <span className="text-slate-400">Last successful sync {timeAgo(connection!.last_success_at)}</span>
              )}
              {connection!.last_error && (
                <span className="flex items-center gap-1 text-rose-600"><AlertTriangle size={13} /> {connection!.last_error}</span>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Target calendar</p>
                {connection!.target_calendar_name ? (
                  <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {connection!.target_calendar_name}
                  </span>
                ) : (
                  <span className="text-sm text-amber-600">Not selected — events cannot sync yet</span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={loadCalendars}>
                {connection!.target_calendar_name ? 'Change calendar' : 'Choose calendar'}
              </Button>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                Routing mode
                <select
                  defaultValue={connection!.routing_mode}
                  onChange={(e) => startTransition(async () => {
                    const res = await setRoutingMode(e.target.value as 'shared' | 'superintendent')
                    if (res?.error) setError(res.error); else router.refresh()
                  })}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="shared">Shared schedule calendar</option>
                  <option value="superintendent">Superintendent calendars</option>
                </select>
              </label>
              <a href="/api/google/oauth/start" className="text-xs text-slate-400 underline hover:text-slate-600">Reconnect</a>
              <button
                onClick={() => startTransition(async () => {
                  const res = await disconnectGoogle()
                  if (res?.error) setError(res.error); else router.refresh()
                })}
                className="text-xs text-rose-500 underline hover:text-rose-600"
                disabled={pending}
              >
                Disconnect
              </button>
            </div>

            {calendars && (
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-2 text-xs font-semibold text-slate-500">Pick the calendar PhaseForge writes to (only this calendar is ever touched):</p>
                <div className="flex flex-wrap gap-1.5">
                  {calendars.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => startTransition(async () => {
                        const res = await setTargetCalendar(c.id, c.name)
                        if (res?.error) setError(res.error)
                        else { setCalendars(null); router.refresh() }
                      })}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600"
                    >
                      {c.name}{c.primary ? ' (primary — not recommended for testing)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Pending calendar changes (Google-side edits held for review) ── */}
      {pendingChanges.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/20">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
            <AlertTriangle size={15} /> Calendar changes awaiting review ({pendingChanges.length})
          </h2>
          <p className="mb-3 text-xs text-amber-700/70 dark:text-amber-300/70">
            Someone edited or deleted these events directly in Google Calendar. PhaseForge stays the source of
            truth — choose to restore the PhaseForge version or accept the Google change.
          </p>
          <div className="space-y-2">
            {pendingChanges.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
                <span className="flex-1 min-w-0 text-slate-700 dark:text-slate-200">
                  <span className="font-medium">{c.projectName ?? 'Unknown project'}</span>
                  {c.phaseName && <> — {c.phaseName}</>}
                  <span className="ml-2 text-xs text-slate-400">
                    {c.changeType === 'deleted'
                      ? 'event was deleted in Google'
                      : c.changeType === 'title'
                        ? `title changed to “${c.gcalValue.title ?? '?'}”`
                        : c.changeType}
                  </span>
                </span>
                <button
                  onClick={() => startTransition(async () => {
                    const res = await resolvePendingChange(c.id, 'keep')
                    if (res?.error) setError(res.error); else router.refresh()
                  })}
                  disabled={pending}
                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {c.changeType === 'deleted' ? 'Recreate event' : 'Restore PhaseForge version'}
                </button>
                <button
                  onClick={() => startTransition(async () => {
                    const res = await resolvePendingChange(c.id, 'dismiss')
                    if (res?.error) setError(res.error); else router.refresh()
                  })}
                  disabled={pending}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Superintendents ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <HardHat size={16} className="text-indigo-500" /> Superintendents
          </h2>
          <Button size="sm" onClick={() => setEditSup('new')}><Plus size={14} /> Add</Button>
        </div>
        {superintendents.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No superintendents yet — add your field leads here, then select them on projects and phases.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {superintendents.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {s.name}
                    {!s.is_active && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">inactive</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {[s.email, s.gcal_calendar_id && 'own calendar', `${s.default_label_ids.length} default SCH`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button onClick={() => setEditSup(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                  <Pencil size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── SCH labels ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <Tag size={16} className="text-indigo-500" /> SCH Schedule Labels
          </h2>
          <Button size="sm" onClick={() => setEditLabel('new')}><Plus size={14} /> Add</Button>
        </div>
        {labels.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No SCH labels yet — e.g. &quot;SCH - John Smith&quot;, &quot;SCH - Refrigeration&quot;. Each label can map to a calendar, event color, and attendee.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {labels.map((l) => (
              <button
                key={l.id}
                onClick={() => setEditLabel(l)}
                className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium transition hover:border-indigo-300 dark:border-slate-700"
                style={{ opacity: l.is_active ? 1 : 0.5 }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                {l.name}
                {l.gcal_color_id && <span className="text-[10px] text-slate-400">color {l.gcal_color_id}</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Modals ── */}
      {editSup && (
        <Modal open onClose={() => setEditSup(null)} title={editSup === 'new' ? 'Add Superintendent' : 'Edit Superintendent'}>
          <SupForm
            sup={editSup === 'new' ? null : editSup}
            labels={labels}
            onDone={() => { setEditSup(null); router.refresh() }}
          />
        </Modal>
      )}
      {editLabel && (
        <Modal open onClose={() => setEditLabel(null)} title={editLabel === 'new' ? 'Add SCH Label' : 'Edit SCH Label'}>
          <LabelForm
            label={editLabel === 'new' ? null : editLabel}
            superintendents={superintendents}
            onDone={() => { setEditLabel(null); router.refresh() }}
          />
        </Modal>
      )}
    </div>
  )
}

function SetupStep({ n, done, label, hint, action }: {
  n: number; done: boolean; label: string; hint: string; action: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 dark:bg-slate-900">
      {done ? (
        <CheckCircle2 size={20} className="flex-shrink-0 text-emerald-500" />
      ) : (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-indigo-300 text-[11px] font-bold text-indigo-500">
          {n}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>{label}</p>
        {!done && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      {action}
    </li>
  )
}

function SupForm({ sup, labels, onDone }: { sup: Superintendent | null; labels: SchLabel[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [labelIds, setLabelIds] = useState<string[]>(sup?.default_label_ids ?? [])
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
          const res = await saveSuperintendent({
            id: sup?.id,
            name: String(fd.get('name') ?? ''),
            email: String(fd.get('email') ?? ''),
            phone: String(fd.get('phone') ?? ''),
            gcal_email: String(fd.get('gcal_email') ?? ''),
            gcal_calendar_id: String(fd.get('gcal_calendar_id') ?? ''),
            default_label_ids: labelIds,
            is_active: fd.get('is_active') === 'on',
            notes: String(fd.get('notes') ?? ''),
          })
          if (res?.error) setError(res.error); else onDone()
        })
      }}
    >
      <Input name="name" label="Name" defaultValue={sup?.name} required autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <Input name="email" label="Email" type="email" defaultValue={sup?.email ?? ''} />
        <Input name="phone" label="Phone" defaultValue={sup?.phone ?? ''} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input name="gcal_email" label="Google Calendar email" defaultValue={sup?.gcal_email ?? ''} placeholder="for event invites" />
        <Input name="gcal_calendar_id" label="Own calendar ID" defaultValue={sup?.gcal_calendar_id ?? ''} placeholder="Superintendent-calendar mode" />
      </div>
      {labels.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Default SCH labels (applied when this superintendent is assigned)</p>
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => setLabelIds((ids) => ids.includes(l.id) ? ids.filter((x) => x !== l.id) : [...ids, l.id])}
                className={`rounded-full border px-2.5 py-1 text-xs ${labelIds.includes(l.id) ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="is_active" defaultChecked={sup?.is_active ?? true} /> Active
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end pt-2"><Button type="submit" loading={pending}>Save</Button></div>
    </form>
  )
}

function LabelForm({ label, superintendents, onDone }: { label: SchLabel | null; superintendents: Superintendent[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // The color the user picks IS a Google Calendar color, so the chip and the
  // event always match — no separate "color code" field to think about.
  const [colorId, setColorId] = useState<string>(
    label?.gcal_color_id || nearestGoogleColorId(label?.color) || '7'
  )
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
          const res = await saveScheduleLabel({
            id: label?.id,
            name: String(fd.get('name') ?? ''),
            color: GOOGLE_EVENT_COLORS[colorId] ?? '#039BE5',
            gcal_color_id: colorId,
            gcal_attendee_email: String(fd.get('gcal_attendee_email') ?? ''),
            gcal_calendar_id: String(fd.get('gcal_calendar_id') ?? ''),
            superintendent_id: String(fd.get('superintendent_id') ?? '') || null,
            is_active: fd.get('is_active') === 'on',
          })
          if (res?.error) setError(res.error); else onDone()
        })
      }}
    >
      <Input name="name" label="Label name" defaultValue={label?.name} required autoFocus placeholder='e.g. "SCH - John Smith"' />
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Calendar color</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(GOOGLE_EVENT_COLORS).map(([id, hex]) => (
            <button
              key={id}
              type="button"
              onClick={() => setColorId(id)}
              title={`Google color ${id}`}
              className="h-8 w-8 rounded-full border-2 transition-all"
              style={{ backgroundColor: hex, borderColor: colorId === id ? '#0f172a' : 'transparent' }}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">This is the exact color the event shows on Google Calendar.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input name="gcal_attendee_email" label="Add attendee email" defaultValue={label?.gcal_attendee_email ?? ''} placeholder="optional" />
        <Input name="gcal_calendar_id" label="Route to calendar ID" defaultValue={label?.gcal_calendar_id ?? ''} placeholder="optional" />
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Linked superintendent (optional)
        <select name="superintendent_id" defaultValue={label?.superintendent_id ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">—</option>
          {superintendents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="is_active" defaultChecked={label?.is_active ?? true} /> Active
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end pt-2"><Button type="submit" loading={pending}>Save</Button></div>
    </form>
  )
}
