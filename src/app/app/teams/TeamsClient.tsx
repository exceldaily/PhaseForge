'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Users, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface TeamMemberRow { profile_id: string }
interface Team { id: string; name: string; color: string; team_members: TeamMemberRow[] }
interface Member { id: string; full_name: string; job_title: string | null; email: string; role: string }

interface TeamsClientProps {
  teams: Team[]
  members: Member[]
  companyId: string
  canEdit: boolean
}

const TEAM_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899',
]

export function TeamsClient({ teams: initialTeams, members, companyId, canEdit }: TeamsClientProps) {
  const [teams, setTeams] = useState(initialTeams)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TEAM_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const memberMap = Object.fromEntries(members.map(m => [m.id, m]))

  const createTeam = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('teams')
      .insert({ name: newName.trim(), color: newColor, company_id: companyId })
      .select('*, team_members(profile_id)')
      .single()
    setSaving(false)
    if (error) { setError(error.message); return }
    setTeams(prev => [...prev, data])
    setNewName(''); setCreating(false)
  }

  const deleteTeam = async (id: string) => {
    if (!confirm('Delete this team? Members will not be removed from the company.')) return
    const supabase = createClient()
    await supabase.from('teams').delete().eq('id', id)
    setTeams(prev => prev.filter(t => t.id !== id))
  }

  const renameTeam = async (id: string) => {
    if (!editName.trim()) return
    const supabase = createClient()
    await supabase.from('teams').update({ name: editName.trim() }).eq('id', id)
    setTeams(prev => prev.map(t => t.id === id ? { ...t, name: editName.trim() } : t))
    setEditingId(null)
  }

  const toggleMember = async (teamId: string, profileId: string, isIn: boolean) => {
    const supabase = createClient()
    if (isIn) {
      await supabase.from('team_members').delete().eq('team_id', teamId).eq('profile_id', profileId)
      setTeams(prev => prev.map(t => t.id === teamId
        ? { ...t, team_members: t.team_members.filter(m => m.profile_id !== profileId) }
        : t))
    } else {
      await supabase.from('team_members').insert({ team_id: teamId, profile_id: profileId })
      setTeams(prev => prev.map(t => t.id === teamId
        ? { ...t, team_members: [...t.team_members, { profile_id: profileId }] }
        : t))
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teams</h1>
          <p className="text-slate-500 mt-1 text-sm">Organise your company members into sub-groups.</p>
        </div>
        {canEdit && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> New Team
          </button>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Create new team</p>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTeam()}
            placeholder="Team name (e.g. Electrical, Framing)"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Color:</span>
            {TEAM_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                className="h-5 w-5 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: newColor === c ? '#0f172a' : 'transparent' }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={createTeam} disabled={saving || !newName.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Check size={14} /> {saving ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setCreating(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Teams list */}
      {teams.length === 0 && !creating && (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <Users size={32} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">No teams yet</p>
          <p className="text-sm text-slate-400 mt-1">Create teams to group members by trade, department, or role.</p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {teams.map(team => {
          const teamMemberIds = new Set(team.team_members.map(m => m.profile_id))
          const teamMembers = members.filter(m => teamMemberIds.has(m.id))
          const nonMembers = members.filter(m => !teamMemberIds.has(m.id))

          return (
            <div key={team.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"
                style={{ borderLeftColor: team.color, borderLeftWidth: 4 }}>
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />
                  {editingId === team.id ? (
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && renameTeam(team.id)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  ) : (
                    <span className="font-semibold text-slate-900">{team.name}</span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    {editingId === team.id ? (
                      <>
                        <button onClick={() => renameTeam(team.id)}
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(team.id); setEditName(team.name) }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14} /></button>
                        <button onClick={() => deleteTeam(team.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Current members */}
              <div className="px-5 py-4 space-y-2">
                {teamMembers.length === 0 && (
                  <p className="text-xs text-slate-400">No members yet — add from the list below.</p>
                )}
                {teamMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{m.full_name}</p>
                      <p className="text-xs text-slate-400">{m.job_title ?? m.role}</p>
                    </div>
                    {canEdit && (
                      <button onClick={() => toggleMember(team.id, m.id, true)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-rose-200 hover:text-rose-600 transition-colors">
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add members */}
              {canEdit && nonMembers.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Add member</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nonMembers.map(m => (
                      <button key={m.id} onClick={() => toggleMember(team.id, m.id, false)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                        + {m.full_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
