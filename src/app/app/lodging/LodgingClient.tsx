'use client'

// Crew lodging: stays generated from the weekly schedule, booked by hand,
// with hotel searches prefilled from the job address and dates.

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BedDouble, Car, ChevronLeft, ChevronRight, ClipboardCopy, ExternalLink, MapPin,
  Plus, Sparkles, Trash2, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, differenceInDays, parseISO } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { hotelSearchLinks, roomsFor } from '@/lib/lodging/derive'
import { formatDrive, needsLodging, type GuestTravel, type StayTravel } from '@/lib/travel/geo'
import { createStay, deleteStay, deleteWeekStays, generateStaysFromWeek, recomputeTravel, setStayJobAddress, updateStay, type StayStatus } from './actions'

export interface TeamOption { id: string; name: string; division: string | null }

export interface StayRow {
  id: string
  superintendentId: string | null
  scheduleJobId: string | null
  projectId: string | null
  weekStart: string | null
  title: string
  jobNumber: string | null
  location: string | null
  checkIn: string
  checkOut: string
  guests: string[]
  hotelName: string | null
  hotelAddress: string | null
  confirmationNumber: string | null
  nightlyRate: number | null
  notes: string | null
  status: StayStatus
  travel: StayTravel | null
  /** The Schedules job-list entry this stay belongs to, when there is one. */
  job: { id: string; address: string | null; located: boolean } | null
}

interface LodgingClientProps {
  stays: StayRow[]
  teams: TeamOption[]
  teamById: Record<string, string>
  canEdit: boolean
  today: string
  initialTeamId: string | null
  initialWeek: string
  showPast: boolean
}

const STATUS_META: Record<StayStatus, { label: string; cls: string }> = {
  needed:    { label: 'Needs booking', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  booked:    { label: 'Booked',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled',     cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

function shiftWeek(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const nights = (s: StayRow) => Math.max(1, differenceInDays(parseISO(s.checkOut), parseISO(s.checkIn)))

export function LodgingClient({ stays, teams, teamById, canEdit, today, initialTeamId, initialWeek, showPast }: LodgingClientProps) {
  const router = useRouter()
  const [teamId, setTeamId] = useState(initialTeamId ?? '')
  const [week, setWeek] = useState(initialWeek)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [onlyFar, setOnlyFar] = useState(true)
  const [pending, start] = useTransition()

  // Group by week (Sunday), upcoming first; stays without a week go by check-in.
  const groups = useMemo(() => {
    const map = new Map<string, StayRow[]>()
    for (const s of stays) {
      const key = s.weekStart ?? shiftWeek(s.checkIn, -parseISO(s.checkIn).getDay())
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [stays])

  const generate = () => {
    if (!teamId) { setError('Pick a team first.'); return }
    start(async () => {
      setError(null); setMsg(null)
      const res = await generateStaysFromWeek({ superintendentId: teamId, weekStart: week, onlyFar })
      if (!res.ok) { setError(res.error ?? 'Could not generate stays.'); return }
      const bits = [`Added ${res.created} stay${res.created === 1 ? '' : 's'}`]
      if (res.skipped) bits.push(`${res.skipped} already existed`)
      if (res.local) bits.push(`${res.local} ${res.local === 1 ? 'person lives' : 'people live'} close enough to drive`)
      setMsg(res.message ?? `${bits.join(', ')}.`)
      router.refresh()
    })
  }

  const clearWeek = (weekKey: string, rows: StayRow[]) => {
    if (!confirm(`Delete all ${rows.length} stay${rows.length === 1 ? '' : 's'} for the week of ${formatDate(weekKey, 'MMM d')}? Bookings you typed in go with them.`)) return
    start(async () => {
      const res = await deleteWeekStays({ weekStart: weekKey })
      if (!res.ok) { setError(res.error ?? 'Could not delete.'); return }
      setMsg(`Deleted ${res.deleted} stay${res.deleted === 1 ? '' : 's'}.`)
      router.refresh()
    })
  }

  const copyWeek = (weekKey: string, rows: StayRow[]) => {
    const lines = [`LODGING, week of ${formatDate(weekKey, 'MMM d, yyyy')}`, '']
    for (const s of rows) {
      if (s.status === 'cancelled') continue
      lines.push(`${s.title}${s.jobNumber ? ` (Job# ${s.jobNumber})` : ''}`)
      lines.push(`  ${formatDate(s.checkIn, 'EEE MMM d')} to ${formatDate(s.checkOut, 'EEE MMM d')}, ${nights(s)} night${nights(s) === 1 ? '' : 's'}, ${s.guests.length} guest${s.guests.length === 1 ? '' : 's'}, ${roomsFor(s.guests.length)} room${roomsFor(s.guests.length) === 1 ? '' : 's'}`)
      if (s.guests.length) lines.push(`  Guests: ${s.guests.map((g) => {
        const t = s.travel?.guests.find((x) => x.name === g)
        return t?.minutes != null ? `${g} (${formatDrive(t.minutes)} from home)` : g
      }).join(', ')}`)
      if (s.hotelName) lines.push(`  Hotel: ${s.hotelName}${s.hotelAddress ? `, ${s.hotelAddress}` : ''}${s.confirmationNumber ? ` (conf# ${s.confirmationNumber})` : ''}`)
      else lines.push('  Hotel: NOT BOOKED YET')
      if (s.notes) lines.push(`  Notes: ${s.notes}`)
      lines.push('')
    }
    void navigator.clipboard.writeText(lines.join('\n')).then(() => setMsg('Copied. Paste it into an email.'))
  }

  return (
    <div className="mx-auto max-w-none space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BedDouble size={22} className="text-indigo-600" /> Lodging
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Beds for the crews on the weekly schedule. Generate a week, then book each stay.
          </p>
        </div>
        <button
          onClick={() => router.replace(showPast ? '/app/lodging' : '/app/lodging?past=1')}
          className="text-xs font-medium text-indigo-600 hover:underline">
          {showPast ? 'Hide past stays' : 'Show past stays'}
        </button>
      </div>

      {/* ── Generate from a week ── */}
      {canEdit && (
        <section className="rounded-xl border border-slate-200 bg-white p-4" data-help="lodging-generate">
          <p className="text-sm font-semibold text-slate-900">Generate from the schedule</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Everyone scheduled on a job that week becomes a guest, from the first day to the last. Jobs that already have a stay are left alone.
          </p>
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700" data-help="lodging-far">
            <input type="checkbox" checked={onlyFar} onChange={(e) => setOnlyFar(e.target.checked)} />
            Only crew 2+ hours from home (uses the Employees page addresses)
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400">
              <option value="">Pick a team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.division ? ` (${t.division})` : ''}</option>)}
            </select>
            <div className="flex items-center rounded-lg border border-slate-300">
              <button onClick={() => setWeek(shiftWeek(week, -7))} aria-label="Previous week" className="p-1.5 text-slate-500 hover:text-indigo-600"><ChevronLeft size={16} /></button>
              <span className="px-2 text-sm font-medium text-slate-700">Week of {formatDate(week, 'MMM d')}</span>
              <button onClick={() => setWeek(shiftWeek(week, 7))} aria-label="Next week" className="p-1.5 text-slate-500 hover:text-indigo-600"><ChevronRight size={16} /></button>
            </div>
            <Button size="sm" onClick={generate} disabled={pending || !teamId}>
              <Sparkles size={14} /> {pending ? 'Working' : 'Generate stays'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              <Plus size={14} /> {adding ? 'Cancel' : 'Add by hand'}
            </Button>
          </div>
          {adding && <ManualStayForm teams={teams} defaultTeam={teamId} onDone={() => { setAdding(false); router.refresh() }} />}
          {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}
          {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        </section>
      )}

      {/* ── Stays by week ── */}
      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
          <BedDouble size={28} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">No stays yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            Pick a team and a week above and generate stays from what is on the schedule, or add one by hand.
          </p>
        </div>
      )}
      {groups.map(([weekKey, rows]) => {
        const needed = rows.filter((r) => r.status === 'needed').length
        return (
          <section key={weekKey}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Week of {formatDate(weekKey, 'MMM d, yyyy')}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {rows.length} stay{rows.length === 1 ? '' : 's'}{needed ? `, ${needed} still to book` : ''}
                </span>
              </h2>
              <div className="flex items-center gap-3">
                <button onClick={() => copyWeek(weekKey, rows)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600">
                  <ClipboardCopy size={13} /> Copy for email
                </button>
                {canEdit && (
                  <button onClick={() => clearWeek(weekKey, rows)} disabled={pending}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-rose-600">
                    <Trash2 size={13} /> Delete week
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {rows.map((s) => (
                <StayCard key={s.id} stay={s} teamName={s.superintendentId ? teamById[s.superintendentId] : null}
                  canEdit={canEdit} today={today} onChanged={() => router.refresh()} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function StayCard({ stay, teamName, canEdit, today, onChanged }: {
  stay: StayRow; teamName: string | null; canEdit: boolean; today: string; onChanged: () => void
}) {
  const [s, setS] = useState(stay)
  const [open, setOpen] = useState(stay.status === 'needed')
  const [checking, setChecking] = useState(false)
  const travelFor = (name: string): GuestTravel | undefined => s.travel?.guests.find((g) => g.name === name)
  const checkDrive = () => {
    setChecking(true)
    void recomputeTravel({ id: stay.id }).then((r) => {
      setChecking(false)
      if (r.ok) setS((cur) => ({ ...cur, travel: r.travel }))
      onChanged()
    })
  }
  const remove = () => { if (confirm(`Delete the stay for "${s.title}"?`)) void deleteStay({ id: s.id }).then(onChanged) }
  // Job address: typed here, saved on the Schedules job list, drive times
  // re-run. Debounced like the other fields, with a "saving" flag because the
  // geocode plus router round trip takes a second or two.
  const [jobAddr, setJobAddr] = useState(stay.job?.address ?? '')
  const [jobSaving, setJobSaving] = useState(false)
  const saveJobAddress = (v: string) => {
    setJobAddr(v)
    debounced('job-address', () => {
      setJobSaving(true)
      void setStayJobAddress({ id: stay.id, address: v }).then((r) => {
        setJobSaving(false)
        if (!r.ok) return
        setS((cur) => ({ ...cur, location: r.location, travel: r.travel, job: cur.job ? { ...cur.job, address: v.trim() || null, located: r.located } : cur.job }))
        onChanged()
      })
    })
  }
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const debounced = (key: string, fn: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(fn, 600)
  }
  const patch = (local: Partial<StayRow>, db: Record<string, unknown>) => {
    setS((cur) => ({ ...cur, ...local }))
    debounced(Object.keys(db).join('|'), () => { void updateStay({ id: stay.id, patch: db }) })
  }

  const meta = STATUS_META[s.status]
  const links = hotelSearchLinks({ location: s.location, checkIn: s.checkIn, checkOut: s.checkOut, guests: s.guests.length })
  const n = nights(s)
  const isPast = s.checkOut <= today
  const total = s.nightlyRate != null ? s.nightlyRate * n * roomsFor(s.guests.length) : null

  return (
    <div className={cn('group rounded-xl border bg-white', s.status === 'cancelled' ? 'border-slate-200 opacity-70' : 'border-slate-200')}>
      <div className="flex items-start">
      <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{s.title}</p>
            {s.jobNumber && <span className="text-xs text-slate-400">Job# {s.jobNumber}</span>}
            {teamName && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{teamName}</span>}
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', meta.cls)}>{meta.label}</span>
            {isPast && s.status !== 'cancelled' && <span className="text-[10px] text-slate-400">past</span>}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {formatDate(s.checkIn, 'EEE MMM d')} to {formatDate(s.checkOut, 'EEE MMM d')}
            <span className="text-slate-400"> · {n} night{n === 1 ? '' : 's'} · {roomsFor(s.guests.length)} room{roomsFor(s.guests.length) === 1 ? '' : 's'}</span>
            {s.hotelName && <span className="ml-2 font-medium text-emerald-700">{s.hotelName}</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <Users size={11} className="shrink-0 text-slate-400" />
            {s.guests.length === 0 && <span>No guests listed</span>}
            {s.guests.map((g) => <GuestChip key={g} name={g} t={travelFor(g)} />)}
          </div>
        </div>
        {total != null && (
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-slate-900">${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-slate-400">est. total</p>
          </div>
        )}
      </button>
      {canEdit && (
        <button onClick={remove} aria-label="Delete stay" title="Delete this stay"
          className="m-2 shrink-0 rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600">
          <Trash2 size={15} />
        </button>
      )}
      </div>

      {open && (
        <div className="border-t border-slate-100 p-3">
          {/* Drive times */}
          {(s.travel || canEdit) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <Car size={12} className="text-slate-400" />
              {s.travel ? (
                <span>
                  Drive from home checked {formatDate(s.travel.computedAt, 'MMM d')}
                  {s.travel.jobLat === null ? ', job address not on the map yet' : ''}
                  {s.travel.guests.some((g) => g.source === 'estimate') ? ', est. = straight-line estimate' : ''}
                </span>
              ) : <span>Drive times not checked yet.</span>}
              {canEdit && (
                <button onClick={checkDrive} disabled={checking} data-help="lodging-drive"
                  className="font-medium text-indigo-600 hover:underline disabled:opacity-50">
                  {checking ? 'Checking' : 'Check drive times'}
                </button>
              )}
            </div>
          )}
          {/* Job address, shared with the Schedules job list */}
          {s.job && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs" data-help="lodging-job-address">
              <MapPin size={12} className={s.job.located ? 'text-emerald-500' : s.job.address ? 'text-amber-500' : 'text-slate-400'} />
              <span className="font-medium text-slate-600">Job address</span>
              {canEdit ? (
                <input value={jobAddr} placeholder="Street, city, state. Saved on the Schedules job list too."
                  onChange={(e) => saveJobAddress(e.target.value)}
                  className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-2 py-1 outline-none focus:border-indigo-400" />
              ) : <span className="text-slate-600">{s.job.address ?? 'Not set'}</span>}
              <span className="text-[10px] text-slate-400">
                {jobSaving ? 'Saving and checking drive times' : s.job.located ? 'On the map, shared with Schedules' : s.job.address ? 'Not found on the map, check the spelling' : 'Set it once here or on the Schedules job list'}
              </span>
            </div>
          )}
          {/* Where to look */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <MapPin size={12} className="text-slate-400" />
            {canEdit ? (
              <input value={s.location ?? ''} placeholder={s.job ? 'Search hotels near (defaults to the job address)' : 'Job address, city, or store name to search near'}
                onChange={(e) => patch({ location: e.target.value }, { location: e.target.value || null })}
                className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-2 py-1 outline-none focus:border-indigo-400" />
            ) : <span className="text-slate-600">{s.location ?? 'No location set'}</span>}
            {links.maps && (
              <a href={links.maps} target="_blank" rel="noopener noreferrer" data-help="lodging-find"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
                Hotels on Maps <ExternalLink size={11} />
              </a>
            )}
            {links.booking && (
              <a href={links.booking} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
                Booking.com <ExternalLink size={11} />
              </a>
            )}
          </div>

          {canEdit && (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Hotel" value={s.hotelName ?? ''} onChange={(v) => patch({ hotelName: v, status: v ? 'booked' : s.status }, { hotel_name: v || null })} />
                <Field label="Hotel address" value={s.hotelAddress ?? ''} onChange={(v) => patch({ hotelAddress: v }, { hotel_address: v || null })} />
                <Field label="Confirmation #" value={s.confirmationNumber ?? ''} onChange={(v) => patch({ confirmationNumber: v }, { confirmation_number: v || null })} />
                <Field label="Rate / night / room" value={s.nightlyRate == null ? '' : String(s.nightlyRate)} inputMode="decimal"
                  onChange={(v) => { const num = Number(v.replace(/[$,]/g, '')); patch({ nightlyRate: v === '' || !Number.isFinite(num) ? null : num }, { nightly_rate: v === '' || !Number.isFinite(num) ? null : num }) }} />
                <Field label="Check-in" type="date" value={s.checkIn} onChange={(v) => v && patch({ checkIn: v }, { check_in: v })} />
                <Field label="Check-out" type="date" value={s.checkOut} onChange={(v) => v && patch({ checkOut: v }, { check_out: v })} />
                <Field label="Guests (comma separated)" value={s.guests.join(', ')}
                  onChange={(v) => { const g = v.split(',').map((x) => x.trim()).filter(Boolean); patch({ guests: g }, { guests: g }) }} />
                <label className="block">
                  <span className="text-[11px] font-medium text-slate-500">Status</span>
                  <select value={s.status} onChange={(e) => patch({ status: e.target.value as StayStatus }, { status: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
                    <option value="needed">Needs booking</option>
                    <option value="booked">Booked</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <textarea rows={2} value={s.notes ?? ''} placeholder="Notes: room preferences, per diem, who is driving"
                  onChange={(e) => patch({ notes: e.target.value }, { notes: e.target.value || null })}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400" />
                <button onClick={remove}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 size={13} /> Delete stay
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** A guest with their drive from home: red 2h+, grey local, amber unknown. */
function GuestChip({ name, t }: { name: string; t: GuestTravel | undefined }) {
  if (!t) return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{name}</span>
  const far = needsLodging(t)
  const why = t.reason === 'no_employee' ? 'not on the Employees page'
    : t.reason === 'no_home' ? 'no home address'
    : t.reason === 'no_job' ? 'job has no address' : null
  return (
    <span title={why ?? (t.miles != null ? `${t.miles} mi, ${t.source === 'osrm' ? 'road route' : 'straight-line estimate'}` : undefined)}
      className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5',
        far === true ? 'bg-rose-50 text-rose-700' : far === false ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700')}>
      {name}
      <span className="text-[10px] font-semibold">
        {t.minutes != null ? `${formatDrive(t.minutes)}${t.source === 'estimate' ? ' est.' : ''}` : '?'}
      </span>
    </span>
  )
}

function Field({ label, value, onChange, type = 'text', inputMode }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; inputMode?: 'decimal'
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <input type={type} value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400" />
    </label>
  )
}

function ManualStayForm({ teams, defaultTeam, onDone }: { teams: TeamOption[]; defaultTeam: string; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [jobNumber, setJobNumber] = useState('')
  const [location, setLocation] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState('')
  const [team, setTeam] = useState(defaultTeam)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Job or title" value={title} onChange={setTitle} />
      <Field label="Job #" value={jobNumber} onChange={setJobNumber} />
      <Field label="Location to search near" value={location} onChange={setLocation} />
      <Field label="Check-in" type="date" value={checkIn} onChange={setCheckIn} />
      <Field label="Check-out" type="date" value={checkOut} onChange={setCheckOut} />
      <Field label="Guests (comma separated)" value={guests} onChange={setGuests} />
      <label className="block">
        <span className="text-[11px] font-medium text-slate-500">Team</span>
        <select value={team} onChange={(e) => setTeam(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-400">
          <option value="">None</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2 sm:col-span-2">
        <Button size="sm" disabled={pending || !title.trim() || !checkIn || !checkOut} onClick={() =>
          start(async () => {
            setError(null)
            const res = await createStay({
              title, jobNumber, location, checkIn, checkOut,
              guests: guests.split(',').map((g) => g.trim()).filter(Boolean),
              superintendentId: team || null,
            })
            if (!res.ok) { setError(res.error ?? 'Could not add the stay.'); return }
            onDone()
          })}>
          Add stay
        </Button>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </div>
  )
}
