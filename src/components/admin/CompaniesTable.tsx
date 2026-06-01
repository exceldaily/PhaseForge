'use client'

import { useMemo, useState } from 'react'
import { Edit2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { PlanSelectorModal } from './PlanSelectorModal'

const PAGE_SIZE = 25

interface Company {
  id: string
  name: string
  slug: string
  plan: string
  created_at: string
  updated_at: string
  profiles?: { count: number }[]
  projects?: { count: number }[]
}

interface CompaniesTableProps {
  companies: Company[]
}

export function CompaniesTable({ companies: initialCompanies }: CompaniesTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
  const [companies, setCompanies] = useState(initialCompanies)

  const filteredCompanies = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return q
      ? initialCompanies.filter(c =>
          c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
        )
      : initialCompanies
  }, [initialCompanies, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE))
  const pagedCompanies = filteredCompanies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-6">
      {/* Search */}
      <input
        type="text"
        placeholder="Search by company name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full max-w-xs px-4 py-2 border border-slate-300 rounded-lg mb-6 text-sm"
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-4 font-medium text-slate-700">Company</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Plan</th>
              <th className="text-center py-3 px-4 font-medium text-slate-700">Members</th>
              <th className="text-center py-3 px-4 font-medium text-slate-700">Projects</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Created</th>
            </tr>
          </thead>
          <tbody>
            {pagedCompanies.map((company) => {
              const memberCount = company.profiles?.[0]?.count || 0
              const projectCount = company.projects?.[0]?.count || 0
              return (
                <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <span className="text-slate-900 font-medium">{company.name}</span>
                      <span className="text-slate-500 text-xs">{company.slug}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-700 capitalize">{company.plan}</Badge>
                      <button
                        onClick={() => setEditingCompanyId(company.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        title="Edit plan"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center font-medium text-slate-900">
                    {memberCount}
                  </td>
                  <td className="py-3 px-4 text-center font-medium text-slate-900">
                    {projectCount}
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-xs">
                    {new Date(company.created_at).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filteredCompanies.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No companies found
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>{filteredCompanies.length} compan{filteredCompanies.length !== 1 ? 'ies' : 'y'} · page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {editingCompanyId && (
        <PlanSelectorModal
          open={true}
          onClose={() => setEditingCompanyId(null)}
          companyId={editingCompanyId}
          companyName={companies.find(c => c.id === editingCompanyId)?.name || ''}
          currentPlan={companies.find(c => c.id === editingCompanyId)?.plan || 'free'}
          onSuccess={() => {
            // Update local state with new plan
            const updatedCompanies = companies.map(c =>
              c.id === editingCompanyId ? { ...c, plan: c.plan } : c
            )
            setCompanies(updatedCompanies)
          }}
        />
      )}
    </div>
  )
}
