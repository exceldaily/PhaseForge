// Command Band — the "what needs attention / what's mine / do something now"
// strip at the top of the dashboard. Server component: fetches its own compact
// counts (all indexed lookups) and renders nothing noisy. Sections with zero
// signal collapse to a quiet all-clear line instead of empty cards.

import Link from 'next/link'
import {
  AlertTriangle, BellDot, CheckCircle2, ClipboardList, FolderKanban,
  ListChecks, PhoneCall, Plus, Upload,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

const OPEN_CALL_FILTER = 'status=open,assigned,in_progress,waiting_vendor,waiting_parts,waiting_customer,waiting_quote,follow_up'
const CLOSED_CALL_STATUSES = ['completed', 'closed', 'cancelled']

export async function CommandBand({
  userId,
  companyId,
}: {
  userId: string
  companyId: string
}) {
  const supabase = await createClient()
  const now = new Date()
  const todayIso = now.toISOString()
  const today = todayIso.slice(0, 10)

  const { data: moduleRows } = await supabase
    .from('organization_modules')
    .select('module_key, enabled')
    .eq('company_id', companyId)
  const opsModules = (moduleRows ?? []).filter((m) => m.enabled).map((m) => m.module_key)
  const hasCalls = opsModules.includes('calls')
  const hasFiles = opsModules.includes('files')

  const [callsRes, readsRes, myPhasesRes, myPunchRes] = await Promise.all([
    hasCalls
      ? supabase
          .from('calls')
          .select('id, status, sla_at, due_date, assigned_staff_id, last_note_at')
          .eq('company_id', companyId)
          .not('status', 'in', `(${CLOSED_CALL_STATUSES.join(',')})`)
      : Promise.resolve({ data: [] as never[] }),
    hasCalls
      ? supabase.from('call_reads').select('call_id, last_read_at').eq('user_id', userId)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from('phases')
      .select('id, end_date, status')
      .eq('assigned_to', userId)
      .not('status', 'in', '(completed,skipped)'),
    supabase
      .from('punch_items')
      .select('id, status')
      .eq('assigned_to', userId)
      .neq('status', 'completed'),
  ])

  type CallLite = { id: string; status: string; sla_at: string | null; due_date: string | null; assigned_staff_id: string | null; last_note_at: string | null }
  const openCalls = (callsRes.data ?? []) as CallLite[]
  const readAt = new Map(((readsRes.data ?? []) as { call_id: string; last_read_at: string }[]).map((r) => [r.call_id, r.last_read_at]))

  const overdueCalls = openCalls.filter((c) => {
    const target = c.sla_at ?? (c.due_date ? `${c.due_date}T23:59:59` : null)
    return target !== null && target < todayIso
  }).length

  const unreadCalls = openCalls.filter((c) => {
    if (!c.last_note_at) return false
    const read = readAt.get(c.id)
    return !read || c.last_note_at > read
  }).length

  const myCalls = openCalls.filter((c) => c.assigned_staff_id === userId).length
  const myPhases = (myPhasesRes.data ?? []) as { id: string; end_date: string | null; status: string }[]
  const myOverduePhases = myPhases.filter((p) => p.end_date !== null && p.end_date < today).length
  const myPunch = (myPunchRes.data ?? []).length

  const attention: { label: string; count: number; href: string }[] = [
    ...(overdueCalls > 0 ? [{ label: 'overdue calls', count: overdueCalls, href: '/app/calls?sla=overdue' }] : []),
    ...(unreadCalls > 0 ? [{ label: 'new call updates', count: unreadCalls, href: '/app/calls?unread=yes' }] : []),
    ...(myOverduePhases > 0 ? [{ label: 'overdue tasks of mine', count: myOverduePhases, href: '/app/my-work' }] : []),
  ]

  const myWork: { label: string; count: number; href: string; icon: typeof ListChecks }[] = [
    { label: 'Tasks', count: myPhases.length, href: '/app/my-work', icon: ListChecks },
    { label: 'Punch items', count: myPunch, href: '/app/my-work', icon: ClipboardList },
    ...(hasCalls ? [{ label: 'Calls', count: myCalls, href: `/app/calls?assigned=${userId}&${OPEN_CALL_FILTER}`, icon: PhoneCall }] : []),
  ]

  return (
    <div className="mb-6 grid gap-3 lg:grid-cols-3">
      {/* Attention Required */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <AlertTriangle size={13} /> Attention required
        </p>
        {attention.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={16} /> All clear — nothing overdue or unread.
          </p>
        ) : (
          <div className="space-y-1.5">
            {attention.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-700 transition hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
                <span className="flex items-center gap-2">
                  {a.label === 'new call updates' ? <BellDot size={14} /> : <AlertTriangle size={14} />}
                  {a.label}
                </span>
                <span className="font-bold">{a.count}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* My Work */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">My work</p>
        <div className="flex gap-2">
          {myWork.map(({ label, count, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-lg bg-slate-50 px-2 py-2 transition hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <Icon size={15} className="text-slate-400" />
              <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{count}</span>
              <span className="text-[10px] text-slate-500">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Quick actions</p>
        <div className="grid grid-cols-2 gap-1.5">
          <Link href="/app/projects/new" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300">
            <FolderKanban size={13} /> New project
          </Link>
          {hasCalls && (
            <Link href="/app/calls?new=1" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300">
              <Plus size={13} /> New call
            </Link>
          )}
          <Link href="/app/my-work" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300">
            <ListChecks size={13} /> My work
          </Link>
          {hasFiles && (
            <Link href="/app/files" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300">
              <Upload size={13} /> Upload file
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
