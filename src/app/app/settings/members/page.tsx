import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { InviteMemberButton } from '@/components/settings/InviteMemberButton'
import { Profile, UserRole } from '@/types/app'

const ROLE_COLORS: Record<UserRole, string> = {
  owner: 'bg-indigo-100 text-indigo-700',
  admin: 'bg-violet-100 text-violet-700',
  manager: 'bg-blue-100 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600',
}

export default async function MembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/signup')

  const { data: membersRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: true })
  const members = membersRaw ?? []

  const canManage = profile.role === 'owner' || profile.role === 'admin'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Members</h1>
          <p className="text-slate-500 mt-1">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        {canManage && <InviteMemberButton companyId={profile.company_id} />}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {(members as Profile[]).map(member => (
            <div key={member.id} className="flex items-center gap-4 px-6 py-4">
              <Avatar name={member.full_name} avatarUrl={member.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900">{member.full_name}</p>
                <p className="text-sm text-slate-400">{member.email}</p>
              </div>
              {member.job_title && <p className="text-sm text-slate-500 hidden md:block">{member.job_title}</p>}
              <Badge className={ROLE_COLORS[member.role as UserRole]}>
                {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
