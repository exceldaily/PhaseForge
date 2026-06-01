import { createAdminClient } from '@/lib/supabase/admin'
import { CompaniesTable } from '@/components/admin/CompaniesTable'

export default async function AdminCompaniesPage() {
  const supabase = createAdminClient()

  // Fetch all companies with member and project counts
  const { data: companies } = await supabase
    .from('companies')
    .select(`
      id,
      name,
      slug,
      plan,
      created_at,
      updated_at,
      profiles(count),
      projects(count)
    `)
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">Company Management</h2>
        <p className="text-slate-600 mt-2">View all registered companies</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <CompaniesTable companies={companies || []} />
      </div>
    </div>
  )
}
