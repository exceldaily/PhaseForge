import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InviteMemberButton } from '@/components/settings/InviteMemberButton'
import { MembersClient } from './MembersClient'
import { Profile } from '@/types/app'

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

      <MembersClient
        members={members as Profile[]}
        currentUserId={user.id}
        currentUserRole={profile.role}
        companyId={profile.company_id}
        canManage={canManage}
      />
    </div>
  )
}
