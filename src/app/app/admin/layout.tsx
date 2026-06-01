import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch user profile to check super-admin status
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Redirect if not a super admin
  if (!profile || !profile.is_super_admin) {
    redirect('/app/dashboard')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Admin Header */}
      <div className="border-b border-slate-200 bg-slate-50 px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Console</h1>
          <span className="ml-auto text-sm text-slate-600">Super Admin Access</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  )
}
