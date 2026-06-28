'use client'

import { useMemo, useState } from 'react'
import { Edit2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { PlanSelectorModal } from './PlanSelectorModal'
import { deleteCompany } from '@/app/admin/actions'

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
  boards?: { count: number }[]
}

interface CompaniesTableProps {
  companies: Company[]
}

export function CompaniesTable({ companies: initialCompanies }: CompaniesTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [companies, setCompanies] = useState(initialCompanies)

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>()

    for (const company of companies) {
      const key = company.name.trim().toLowerCase()
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return counts
  }, [companies])

  const filteredCompanies = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return q
      ? companies.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        )
      : companies
  }, [companies, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE))
  const pagedCompanies = filteredCompanies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-6">
      {/* Search */}
      <input
        type="text"
        placeholder="Search by company name..."
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value)
          setPage(1)
        }}
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
              <th className="text-center py-3 px-4 font-medium text-slate-700">Boards</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Created</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {pagedCompanies.map((company) => {
              const memberCount = company.profiles?.[0]?.count || 0
              const projectCount = company.projects?.[0]?.count || 0
              const boardCount = company.boards?.[0]?.count || 0
              const isDuplicateName = (duplicateNames.get(company.name.trim().toLowerCase()) || 0) > 1
              return (
                <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900 font-medium">{company.name}</span>
                        {isDuplicateName && (
                          <Badge className="bg-amber-100 text-amber-700">Duplicate name</Badge>
                        )}
                      </div>
                      <span className="text-slate-500 text-xs">{company.slug}</span>
                      <span className="text-slate-400 text-[11px]">{company.id}</span>
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
                  <td className="py-3 px-4 text-center font-medium text-slate-900">
                    {boardCount}
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-xs">
                    {new Date(company.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setDeletingCompanyId(company.id)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete company"
                    >
                      <Trash2 size={14} />
                    </button>
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
          onSuccess={(newPlan) => {
            const updatedCompanies = companies.map(c =>
              c.id === editingCompanyId ? { ...c, plan: newPlan } : c
            )
            setCompanies(updatedCompanies)
          }}
        />
      )}

      {deletingCompanyId && (() => {
        const company = companies.find(c => c.id === deletingCompanyId)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Company</h3>
              <p className="text-sm text-slate-600 mb-1">
                Are you sure you want to delete <span className="font-semibold text-slate-900">{company?.name}</span>?
              </p>
              <p className="text-xs text-red-600 mb-6">
                This will permanently delete the company and all associated data including members, projects, and boards.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingCompanyId(null)}
                  disabled={deleteLoading}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setDeleteLoading(true)
                    try {
                      await deleteCompany(deletingCompanyId)
                      setCompanies(prev => prev.filter(c => c.id !== deletingCompanyId))
                      setDeletingCompanyId(null)
                    } catch {
                      alert('Failed to delete company. Check console for details.')
                    } finally {
                      setDeleteLoading(false)
                    }
                  }}
                  disabled={deleteLoading}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteLoading ? 'Deleting…' : 'Delete Company'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
