'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Trash2, X, Check, Users, FolderKanban } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface TeamMemberRow  { profile_id: string }
interface TeamProjectRow { project_id: string }
interface Team    { id: string; name: string; color: string; team_members: TeamMemberRow[]; project_teams: TeamProjectRow[] }
interface Member  { id: string; full_name: string; job_title: string | null; email: string; role: string }
interface Project { id: string; name: string; color: string; status: string }

interface TeamsClientProps {
  teams: Team[]
  members: Member[]
  projects: Project[]
  companyId: string
  canEdit: boolean
}

const TEAM_COLORS = [
  '#6366f1','#8b5cf6','#06b6d4','#10b981',
  '#f59e0b','#f43f5e','#3b82f6','#ec4899',
]

export function TeamsClient({ teams: init, members, projects, companyId, canEdit }: TeamsClientProps) {
  const [teams, setTeams] = useState(init)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TEAM_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const memberMap  = Object.fromEntries(members.map(m => [m.id, m]))
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))

  // ── Create ─────────────────────────────────────────────────────────────────
  const createTeam = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('teams')
      .insert({ name: newName.trim(), color: newColor, company_id: companyId })
      .select('*, team_members(profile_id), project_teams(project_id)')
      .single()
    setSaving(false)
    if (error) { setError(error.message); return }
    setTeams(prev => [...prev, data])
    setNewName(''); setCreating(false)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteTeam = async (id: string) => {
    if (!confirm('Delete this team? Members and projects are not deleted, only the team grouping.')) return
    const supabase = createClient()
    await supabase.from('teams').delete().eq('id', id)
    setTeams(prev => prev.filter(t => t.id !== id))
  }

  // ── Rename ─────────────────────────────────────────────────────────────────
  const renameTeam = async (id: string) => {
    if (!editName.trim()) return
    const supabase = createClient()
    await supabase.from('teams').update({ name: editName.trim() }).eq('id', id)
    setTeams(prev => prev.map(t => t.id === id ? { ...t, name: editName.trim() } : t))
    setEditingId(null)
  }

  // ── Toggle member ──────────────────────────────────────────────────────────
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

  // ── Toggle project ─────────────────────────────────────────────────────────
  const toggleProject = async (teamId: string, projectId: string, isIn: boolean) => {
    const supabase = createClient()
    if (isIn) {
      await supabase.from('project_teams').delete().eq('team_id', teamId).eq('project_id', projectId)
      setTeams(prev => prev.map(t => t.id === teamId
        ? { ...t, project_teams: t.project_teams.filter(pt => pt.project_id !== projectId) }
        : t))
    } else {
      await supabase.from('project_teams').insert({ team_id: teamId, project_id: projectId })
      setTeams(prev => prev.map(t => t.id === teamId
        ? { ...t, project_teams: [...t.project_teams, { project_id: projectId }] }
        : t))
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teams</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Groups of people within your organization. Teams can share members and projects.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/organization"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            View Organization →
          </Link>
          {canEdit && (
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
              <Plus size={15} /> New Team
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</p>}

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-800">Create new team</p>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTeam()}
            placeholder="Team name (e.g. Electrical, Structural, Management)"
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Color:</span>
            {TEAM_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setNewColor(c)}
                className={cn('h-6 w-6 rounded-full border-2 transition-all', newColor === c ? 'border-slate-900 scale-110' : 'border-transparent')}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={createTeam} disabled={saving || !newName.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Check size={14} /> {saving ? 'Creating…' : 'Create Team'}
            </button>
            <button onClick={() => { setCreating(false); setNewName('') }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty */}
      {teams.length === 0 && !creating && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <Users size={36} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-600 font-semibold">No teams yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">
            Create teams to group members by trade, department, or function. Then assign projects to teams.
          </p>
          {canEdit && (
            <button onClick={() => setCreating(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              <Plus size={14} /> Create First Team
            </button>
          )}
        </div>
      )}

      {/* Team cards */}
      <div className="space-y-4">
        {teams.map(team => {
          const memberIds  = new Set(team.team_members.map(m => m.profile_id))
          const projectIds = new Set(team.project_teams.map(pt => pt.project_id))
          const teamMembers  = members.filter(m => memberIds.has(m.id))
          const teamProjects = projects.filter(p => projectIds.has(p.id))
          const nonMembers   = members.filter(m => !memberIds.has(m.id))
          const nonProjects  = projects.filter(p => !projectIds.has(p.id))
          const isExpanded   = expandedId === team.id

          return (
            <div key={team.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {/* Team header */}
              <div className="flex items-center justify-between px-6 py-4"
                style={{ borderLeftWidth: 4, borderLeftColor: team.color }}>
                <button className="flex items-center gap-3 flex-1 text-left" onClick={() => setExpandedId(isExpanded ? null : team.id)}>
                  <span className="h-3.5 w-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                  {editingId === team.id ? (
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameTeam(team.id); if (e.key === 'Escape') setEditingId(null) }}
                      onClick={e => e.stopPropagation()}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <span className="text-base font-semibold text-slate-900">{team.name}</span>
                  )}
                  <span className="text-sm text-slate-400">
                    {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''} · {teamProjects.length} project{teamProjects.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    {editingId === team.id ? (
                      <>
                        <button onClick={() => renameTeam(team.id)} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"><Check size={15} /></button>
                        <button onClick={() => setEditingId(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(team.id); setEditName(team.name) }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Rename">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteTeam(team.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete team">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded panel */}
              {isExpanded && (
                <div className="border-t border-slate-100 grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">

                  {/* ── Members column ── */}
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-slate-400" />
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Members</p>
                    </div>

                    {teamMembers.length === 0 ? (
                      <p className="text-xs text-slate-400">No members in this team yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {teamMembers.map(m => (
                          <div key={m.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{m.full_name}</p>
                              <p className="text-xs text-slate-400">{ROLE_LABELS[m.role] ?? m.role}</p>
                            </div>
                            {canEdit && (
                              <button onClick={() => toggleMember(team.id, m.id, true)}
                                className="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-rose-200 hover:text-rose-600 transition-colors">
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && nonMembers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">Add member</p>
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

                  {/* ── Projects column ── */}
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <FolderKanban size={14} className="text-slate-400" />
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Projects</p>
                    </div>

                    {teamProjects.length === 0 ? (
                      <p className="text-xs text-slate-400">No projects assigned to this team.</p>
                    ) : (
                      <div className="space-y-2">
                        {teamProjects.map(p => (
                          <div key={p.id} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                              <Link href={`/app/projects/${p.id}`}
                                className="text-sm text-slate-700 hover:text-indigo-600 hover:underline truncate">
                                {p.name}
                              </Link>
                            </div>
                            {canEdit && (
                              <button onClick={() => toggleProject(team.id, p.id, true)}
                                className="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-rose-200 hover:text-rose-600 transition-colors">
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && nonProjects.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">Assign project</p>
                        <div className="flex flex-wrap gap-1.5">
                          {nonProjects.slice(0, 8).map(p => (
                            <button key={p.id} onClick={() => toggleProject(team.id, p.id, false)}
                              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                              + {p.name}
                            </button>
                          ))}
                          {nonProjects.length > 8 && (
                            <span className="text-xs text-slate-400 py-1">+{nonProjects.length - 8} more in Settings</span>
                          )}
                        </div>
                      </div>
                    )}
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
