import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, Plus, ShieldCheck, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { InviteMemberButton } from '@/components/settings/InviteMemberButton'
import { ROLE_LABELS, ROLE_COLORS, ROLE_DESCRIPTIONS } from '@/lib/constants'
import { UserRole } from '@/types/app'

export default async function OrganizationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, companies(*)').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const canEdit = ['owner', 'admin'].includes(profile.role)

  const [membersRes, teamsRes, projectsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('company_id', profile.company_id).eq('is_active', true).order('created_at'),
    supabase.from('teams').select('*, team_members(profile_id), project_teams(project_id)').eq('company_id', profile.company_id).order('name'),
    supabase.from('projects').select('id, name, color, status').eq('company_id', profile.company_id).eq('is_archived', false),
  ])

  const members = membersRes.data ?? []
  const teams   = (teamsRes.data ?? []) as any[]
  const projects = projectsRes.data ?? []

  const memberMap  = Object.fromEntries(members.map(m => [m.id, m]))
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))

  const company = (profile as any).companies

  const roleGroups = ['owner', 'admin', 'manager', 'member', 'viewer'] as const
  const membersByRole = roleGroups.reduce((acc, role) => {
    acc[role] = members.filter(m => m.role === role)
    return acc
  }, {} as Record<string, typeof members>)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-10">

      {/* ── Org header ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white">
              <Building2 size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{company?.name ?? 'Your Organization'}</h1>
              <p className="text-sm text-slate-500 mt-0.5 capitalize">{company?.plan ?? 'Free'} plan</p>
            </div>
          </div>
          {canEdit && (
            <Link href="/app/settings" className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <Settings size={15} /> Settings
            </Link>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <Stat label="Members" value={members.length} />
          <Stat label="Teams" value={teams.length} />
          <Stat label="Active Projects" value={projects.length} />
        </div>
      </div>

      {/* ── Role structure ── */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-4">Role Structure</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(['owner', 'admin', 'manager', 'member'] as const).map(role => (
            <div key={role} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold mb-3 ${ROLE_COLORS[role]}`}>
                {ROLE_LABELS[role]}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{ROLE_DESCRIPTIONS[role]}</p>
              <p className="mt-3 text-sm font-bold text-slate-900">
                {(membersByRole[role] ?? []).length}
                {role === 'member' ? (
                  <span className="font-normal text-slate-400"> member{(membersByRole[role] ?? []).length !== 1 ? 's' : ''} + {(membersByRole['viewer'] ?? []).length} legacy</span>
                ) : (
                  <span className="font-normal text-slate-400"> {(membersByRole[role] ?? []).length !== 1 ? 'members' : 'member'}</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Teams ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Teams</h2>
          {canEdit && (
            <Link href="/app/teams" className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
              <Plus size={14} /> Manage Teams
            </Link>
          )}
        </div>

        {teams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
            <p className="text-slate-400 text-sm">No teams yet.</p>
            {canEdit && (
              <Link href="/app/teams" className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline">
                Create your first team →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {teams.map(team => {
              const teamMemberIds = (team.team_members ?? []).map((m: any) => m.profile_id)
              const teamMembers = teamMemberIds.map((id: string) => memberMap[id]).filter(Boolean)
              const teamProjectIds = (team.project_teams ?? []).map((pt: any) => pt.project_id)
              const teamProjects = teamProjectIds.map((id: string) => projectMap[id]).filter(Boolean)

              return (
                <div key={team.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  {/* Team header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100"
                    style={{ borderLeftWidth: 4, borderLeftColor: team.color }}>
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                      <span className="font-semibold text-slate-900 text-lg">{team.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span>{teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{teamProjects.length} project{teamProjects.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                    {/* Members */}
                    <div className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Members</p>
                      {teamMembers.length === 0 ? (
                        <p className="text-xs text-slate-400">No members assigned</p>
                      ) : (
                        <div className="space-y-2.5">
                          {teamMembers.slice(0, 5).map((m: any) => (
                            <div key={m.id} className="flex items-center gap-2.5">
                              <Avatar name={m.full_name} avatarUrl={m.avatar_url} size="sm" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{m.full_name}</p>
                                <p className="text-xs text-slate-400">{ROLE_LABELS[m.role] ?? m.role}</p>
                              </div>
                            </div>
                          ))}
                          {teamMembers.length > 5 && (
                            <p className="text-xs text-slate-400">+{teamMembers.length - 5} more</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Projects */}
                    <div className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Projects</p>
                      {teamProjects.length === 0 ? (
                        <p className="text-xs text-slate-400">No projects assigned to this team</p>
                      ) : (
                        <div className="space-y-2">
                          {teamProjects.slice(0, 5).map((p: any) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                              <Link href={`/app/projects/${p.id}`}
                                className="text-sm text-slate-700 hover:text-indigo-600 hover:underline truncate">
                                {p.name}
                              </Link>
                            </div>
                          ))}
                          {teamProjects.length > 5 && (
                            <p className="text-xs text-slate-400">+{teamProjects.length - 5} more</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── All Members ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
            All Members <span className="ml-1 text-slate-300">({members.length})</span>
          </h2>
          {canEdit && <InviteMemberButton companyId={profile.company_id} />}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="divide-y divide-slate-100">
            {members.map(m => {
              const memberTeams = teams.filter(t =>
                (t.team_members ?? []).some((tm: any) => tm.profile_id === m.id)
              )
              return (
                <div key={m.id} className="flex items-center gap-4 px-6 py-4">
                  <Avatar name={m.full_name} avatarUrl={m.avatar_url} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{m.full_name}</p>
                    <p className="text-sm text-slate-400">{m.email}</p>
                  </div>
                  {memberTeams.length > 0 && (
                    <div className="hidden md:flex items-center gap-1.5 flex-wrap">
                      {memberTeams.slice(0, 3).map(t => (
                        <span key={t.id} className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500"
                          style={{ borderColor: t.color + '66', color: t.color }}>
                          {t.name}
                        </span>
                      ))}
                      {memberTeams.length > 3 && <span className="text-xs text-slate-400">+{memberTeams.length - 3}</span>}
                    </div>
                  )}
                  <Badge className={ROLE_COLORS[m.role as UserRole] ?? 'bg-slate-100 text-slate-600'}>
                    {ROLE_LABELS[m.role as UserRole] ?? m.role}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-8 py-5 text-center">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}
