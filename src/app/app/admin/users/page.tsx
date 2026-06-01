import { createClient } from '@/lib/supabase/server'
import { UsersTable } from '@/components/admin/UsersTable'

export default async function AdminUsersPage() {
  const supabase = await createClient()

  // Fetch all users with their company info
  const { data: users } = await supabase
    .from('profiles')
    .select('*, company:companies(name, slug)')
    .order('created_at', { ascending: false })

  // Fetch all companies for the selector
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, slug')
    .order('name', { ascending: true })

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">User Management</h2>
        <p className="text-slate-600 mt-2">View and manage all registered users</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <UsersTable users={users || []} companies={companies || []} />
      </div>
    </div>
  )
}
