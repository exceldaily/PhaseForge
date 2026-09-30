'use client'

import { useMemo, useState } from 'react'
import { Trash2, AlertCircle } from 'lucide-react'
import { LastActive } from '@/components/settings/LastActive'
import { activityTime, type ActivityRow } from '@/lib/presence'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { ROLE_LABELS, ROLE_COLORS as ROLE_COLOR_MAP } from '@/lib/constants'
import { Profile } from '@/types/app'
import { updateUserRole, deleteUser } from './actions'

interface MembersClientProps {
  members: Profile[]
  currentUserId: string
  currentUserRole: string
  companyId: string
  canManage: boolean
  /** Last activity per person; null when the viewer may not see it. */
  activity?: ActivityRow[] | null
}

const ROLES = ['owner', 'manager', 'member']

export function MembersClient({ members, currentUserId, companyId, canManage, activity = null }: MembersClientProps) {
  const [sortBy, setSortBy] = useState<'joined' | 'active'>('joined')
  const byId = useMemo(() => new Map((activity ?? []).map((a) => [a.profileId, a])), [activity])
  const rows = useMemo(
    () => (sortBy === 'active' ? [...members].sort((a, b) => activityTime(byId.get(b.id)) - activityTime(byId.get(a.id))) : members),
    [members, sortBy, byId],
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleUpdateRole = async (userId: string, newRole: string) => {
    setLoading(true)
    setError('')

    const result = await updateUserRole(userId, newRole, companyId)

    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      setEditingId(null)
      // Refresh page to show updated role
      window.location.reload()
    }
  }

  const handleDeleteUser = async (userId: string) => {
    setLoading(true)
    setError('')

    const result = await deleteUser(userId, companyId)

    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      // Refresh page to show updated member list
      window.location.reload()
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {error && (
        <div className="border-b border-slate-200 bg-rose-50 px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 text-rose-600 flex-shrink-0" />
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        </div>
      )}

      {activity && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs sm:px-6" data-help="members-last-active">
          <span className="font-medium text-slate-600">Last active shows when each person last used PhaseForge.</span>
          <span className="ml-auto flex items-center rounded-lg border border-slate-200 bg-white p-0.5 font-medium">
            {([['joined', 'Order joined'], ['active', 'Most recent first']] as const).map(([v, text]) => (
              <button key={v} type="button" aria-pressed={sortBy === v} onClick={() => setSortBy(v)}
                className={`rounded-md px-2.5 py-1 ${sortBy === v ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{text}</button>
            ))}
          </span>
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {rows.map(member => (
          <div key={member.id} className="flex items-center gap-3 px-4 sm:px-6 py-4">
            <Avatar name={member.full_name} avatarUrl={member.avatar_url} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900">{member.full_name}</p>
              <p className="text-sm text-slate-400">{member.email}</p>
              {activity && <p className="mt-0.5 sm:hidden"><LastActive row={byId.get(member.id)} compact /></p>}
            </div>
            {activity && (
              <div className="hidden w-56 shrink-0 sm:block">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last active</p>
                <LastActive row={byId.get(member.id)} />
              </div>
            )}
            {member.job_title && <p className="text-sm text-slate-500 hidden md:block">{member.job_title}</p>}

            {/* Role Badge / Dropdown */}
            {editingId === member.id && canManage ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                >
                  {ROLES.map(role => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleUpdateRole(member.id, selectedRole)}
                  disabled={loading || !selectedRole}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Badge className={ROLE_COLOR_MAP[member.role] ?? 'bg-slate-100 text-slate-600'}>
                {ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ?? member.role}
              </Badge>
            )}

            {/* Action Buttons */}
            {canManage && member.id !== currentUserId && (
              <div className="flex items-center gap-2">
                {deletingId === member.id ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600">Confirm delete?</span>
                    <button
                      onClick={() => handleDeleteUser(member.id)}
                      disabled={loading}
                      className="px-2 py-1 text-xs font-medium rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      disabled={loading}
                      className="px-2 py-1 text-xs font-medium rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(member.id)
                        setSelectedRole(member.role)
                      }}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Edit role"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingId(member.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete member"
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
