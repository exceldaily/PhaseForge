import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { Profile } from '@/types/app'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <AppShell
      profile={profile as Profile}
      isSuperAdmin={profile?.is_super_admin ?? false}
    >
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  )
}
