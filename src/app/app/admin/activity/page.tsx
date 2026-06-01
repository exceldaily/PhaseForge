import { createClient } from '@/lib/supabase/server'
import { ActivityTimeline } from '@/components/admin/ActivityTimeline'

export default async function AdminActivityPage() {
  const supabase = await createClient()

  // Fetch admin audit logs
  const { data: logs } = await supabase
    .from('admin_audit_logs')
    .select('*, actor:profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">Admin Audit Log</h2>
        <p className="text-slate-600 mt-2">All admin actions and system changes</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <ActivityTimeline logs={logs || []} />
      </div>
    </div>
  )
}
