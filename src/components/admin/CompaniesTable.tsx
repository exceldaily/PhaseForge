'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'

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

  const filteredCompanies = initialCompanies.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
            {filteredCompanies.map((company) => {
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
                    <Badge className="bg-slate-100 text-slate-700">{company.plan}</Badge>
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
    </div>
  )
}
