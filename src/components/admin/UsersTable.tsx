'use client'

import { useMemo, useState } from 'react'

const PAGE_SIZE = 25
import { Profile } from '@/types/app'
import { ChevronDown, Trash2, Lock, Shield, Edit } from 'lucide-react'
import { deactivateUser, deleteUser, promoteToSuperAdmin, demoteFromSuperAdmin, updateUserProfile } from '@/app/admin/actions'
import { Badge } from '@/components/ui/Badge'

interface User extends Profile {
  company?: { name: string; slug: string } | null
}

interface UsersTableProps {
  users: User[]
}

export function UsersTable({ users: initialUsers }: UsersTableProps) {
  const [users, setUsers] = useState(initialUsers)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editData, setEditData] = useState<{ full_name?: string; email?: string; job_title?: string }>({})
  const [page, setPage] = useState(1)

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return q
      ? users.filter(u =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        )
      : users
  }, [users, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleDeactivate = async (userId: string, email: string) => {
    if (!confirm(`Deactivate user ${email}? They won't be able to log in.`)) return

    setActionInProgress(userId)
    try {
      await deactivateUser(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: false } : u))
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This action cannot be undone.`)) return

    setActionInProgress(userId)
    try {
      await deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const handlePromoteToAdmin = async (userId: string) => {
    setActionInProgress(userId)
    try {
      await promoteToSuperAdmin(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_super_admin: true } : u))
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDemoteFromAdmin = async (userId: string) => {
    if (!confirm('Demote this user from super-admin?')) return

    setActionInProgress(userId)
    try {
      await demoteFromSuperAdmin(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_super_admin: false } : u))
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleSaveEdit = async (userId: string) => {
    try {
      await updateUserProfile(userId, editData)
      setUsers(prev =>
        prev.map(u =>
          u.id === userId
            ? { ...u, ...editData }
            : u
        )
      )
      setEditingUserId(null)
      setEditData({})
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="p-6">
      {/* Search */}
      <input
        type="text"
        placeholder="Search by name or email..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full max-w-xs px-4 py-2 border border-slate-300 rounded-lg mb-6 text-sm"
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-4 font-medium text-slate-700">Name</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Email</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Company</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Role</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Status</th>
              <th className="text-left py-3 px-4 font-medium text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedUsers.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4">
                  {editingUserId === user.id ? (
                    <input
                      type="text"
                      value={editData.full_name ?? user.full_name}
                      onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                      className="px-2 py-1 border border-slate-300 rounded text-sm w-full"
                    />
                  ) : (
                    <span className="text-slate-900 font-medium">
                      {user.full_name}
                      {user.is_super_admin && <Badge className="ml-2 bg-red-100 text-red-700">Super Admin</Badge>}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-slate-600">
                  {editingUserId === user.id ? (
                    <input
                      type="email"
                      value={editData.email ?? user.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="px-2 py-1 border border-slate-300 rounded text-sm w-full"
                    />
                  ) : (
                    user.email
                  )}
                </td>
                <td className="py-3 px-4 text-slate-600">
                  {user.company?.name || 'No company'}
                </td>
                <td className="py-3 px-4">
                  <Badge className="bg-blue-100 text-blue-700">{user.role}</Badge>
                </td>
                <td className="py-3 px-4">
                  {user.is_active ? (
                    <Badge className="bg-green-100 text-green-700">Active</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-700">Inactive</Badge>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {editingUserId === user.id ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(user.id)}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingUserId(null)
                            setEditData({})
                          }}
                          className="px-2 py-1 bg-slate-300 text-slate-700 text-xs rounded hover:bg-slate-400"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <details className="group">
                        <summary className="cursor-pointer flex items-center gap-1 px-3 py-1 rounded hover:bg-slate-200 text-slate-700">
                          <ChevronDown size={16} />
                        </summary>
                        <div className="absolute bg-white border border-slate-200 rounded shadow-lg mt-1 z-10 min-w-max">
                          <button
                            onClick={() => {
                              setEditingUserId(user.id)
                              setEditData({ full_name: user.full_name, email: user.email, job_title: user.job_title || '' })
                            }}
                            disabled={actionInProgress === user.id}
                            className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm text-slate-700 flex items-center gap-2 border-b border-slate-100"
                          >
                            <Edit size={16} /> Edit
                          </button>
                          {user.is_active && (
                            <button
                              onClick={() => handleDeactivate(user.id, user.email)}
                              disabled={actionInProgress === user.id}
                              className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm text-slate-700 flex items-center gap-2 border-b border-slate-100"
                            >
                              <Lock size={16} /> Deactivate
                            </button>
                          )}
                          {user.is_super_admin ? (
                            <button
                              onClick={() => handleDemoteFromAdmin(user.id)}
                              disabled={actionInProgress === user.id}
                              className="w-full text-left px-4 py-2 hover:bg-yellow-50 text-sm text-yellow-700 flex items-center gap-2 border-b border-slate-100"
                            >
                              <Shield size={16} /> Demote from Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePromoteToAdmin(user.id)}
                              disabled={actionInProgress === user.id}
                              className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm text-blue-700 flex items-center gap-2 border-b border-slate-100"
                            >
                              <Shield size={16} /> Promote to Admin
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(user.id, user.email)}
                            disabled={actionInProgress === user.id}
                            className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-red-700 flex items-center gap-2"
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No users found
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} · page {page} of {totalPages}</span>
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
    </div>
  )
}
