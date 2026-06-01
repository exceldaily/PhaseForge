import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Users, Building2, Activity, BarChart3 } from 'lucide-react'

interface RecentAdminAction {
  id: string
  action: string
  actor?: {
    full_name?: string | null
    email?: string | null
  } | null
  target_email?: string | null
  target_id: string
  created_at: string
}

export default async function AdminDashboard() {
  const supabase = createAdminClient()

  // Fetch stats
  const [
    { count: totalUsers },
    { count: totalCompanies },
    { count: totalProjects },
    { data: recentActions },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('companies').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase
      .from('admin_audit_logs')
      .select('*, actor:profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const recentAdminActions = (recentActions || []) as RecentAdminAction[]

  return (
    <div className="p-8">
      {/* Title */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-600 mt-2">System overview and user management</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {/* Total Users */}
        <Link href="/app/admin/users">
          <div className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Total Users</p>
                <p className="text-4xl font-bold text-slate-900 mt-2">{totalUsers || 0}</p>
              </div>
              <Users size={32} className="text-blue-500" />
            </div>
          </div>
        </Link>

        {/* Total Companies */}
        <Link href="/app/admin/companies">
          <div className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Companies</p>
                <p className="text-4xl font-bold text-slate-900 mt-2">{totalCompanies || 0}</p>
              </div>
              <Building2 size={32} className="text-green-500" />
            </div>
          </div>
        </Link>

        {/* Total Projects */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Projects</p>
              <p className="text-4xl font-bold text-slate-900 mt-2">{totalProjects || 0}</p>
            </div>
            <BarChart3 size={32} className="text-purple-500" />
          </div>
        </div>

        {/* Activity Log Link */}
        <Link href="/app/admin/activity">
          <div className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Audit Log</p>
                <p className="text-slate-400 text-sm mt-2">Admin actions</p>
              </div>
              <Activity size={32} className="text-orange-500" />
            </div>
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Users Card */}
        <Link href="/app/admin/users">
          <div className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Manage Users</h3>
            <p className="text-slate-600 text-sm mb-4">
              View, edit, deactivate, or delete user accounts. Promote users to super-admin.
            </p>
            <button className="text-blue-600 text-sm font-medium hover:underline">
              Go to Users →
            </button>
          </div>
        </Link>

        {/* Companies Card */}
        <Link href="/app/admin/companies">
          <div className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Manage Companies</h3>
            <p className="text-slate-600 text-sm mb-4">
              View all registered companies, their plans, members, and project counts.
            </p>
            <button className="text-green-600 text-sm font-medium hover:underline">
              Go to Companies →
            </button>
          </div>
        </Link>

        {/* Activity Log Card */}
        <Link href="/app/admin/activity">
          <div className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Audit Log</h3>
            <p className="text-slate-600 text-sm mb-4">
              View all admin actions performed on the system for accountability.
            </p>
            <button className="text-orange-600 text-sm font-medium hover:underline">
              View Log →
            </button>
          </div>
        </Link>
      </div>

      {/* Recent Actions */}
      {recentAdminActions.length > 0 && (
        <div className="mt-8 bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Admin Actions</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentAdminActions.map((action) => (
              <div key={action.id} className="flex items-start justify-between text-sm border-b border-slate-100 pb-3 last:border-0">
                <div>
                  <p className="text-slate-900 font-medium">{action.action}</p>
                  <p className="text-slate-600 text-xs">
                    by {action.actor?.full_name || 'Unknown'} • {action.target_email || action.target_id}
                  </p>
                </div>
                <p className="text-slate-500 text-xs whitespace-nowrap ml-4">
                  {new Date(action.created_at).toLocaleDateString()} {new Date(action.created_at).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
