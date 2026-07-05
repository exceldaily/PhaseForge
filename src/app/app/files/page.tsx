import { requireModule } from '@/lib/operations/server'
import { createClient } from '@/lib/supabase/server'
import { FilesClient } from './FilesClient'

export const dynamic = 'force-dynamic'

export default async function FilesPage() {
  const ctx = await requireModule('files')
  const supabase = await createClient()

  const [{ data: files }, { data: customers }, { data: profiles }] = await Promise.all([
    supabase.from('org_files').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(500),
    supabase.from('customers').select('id, name').eq('company_id', ctx.companyId).order('name'),
    supabase.from('profiles').select('id, full_name').eq('company_id', ctx.companyId),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <FilesClient
        files={files ?? []}
        customers={customers ?? []}
        profiles={profiles ?? []}
        companyId={ctx.companyId}
        canWrite={ctx.opsRole !== 'read_only'}
      />
    </div>
  )
}
