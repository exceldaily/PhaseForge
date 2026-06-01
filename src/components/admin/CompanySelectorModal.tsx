'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { updateUserCompany } from '@/app/admin/actions'

interface Company {
  id: string
  name: string
  slug: string
}

interface CompanySelectorModalProps {
  open: boolean
  onClose: () => void
  userId: string
  userName: string
  currentCompanyId: string | null
  companies: Company[]
  onSuccess: () => void
}

export function CompanySelectorModal({
  open,
  onClose,
  userId,
  userName,
  currentCompanyId,
  companies,
  onSuccess,
}: CompanySelectorModalProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(currentCompanyId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    setError(null)
    onClose()
  }

  const handleConfirm = async () => {
    if (selectedCompanyId === currentCompanyId) {
      handleClose()
      return
    }

    setLoading(true)
    setError(null)

    try {
      await updateUserCompany(userId, selectedCompanyId)
      onSuccess()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update company')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Change Company for ${userName}`}
      size="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Select Company</label>

          {/* No company option */}
          <label className="flex items-center gap-3 p-3 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors" style={{
            borderColor: selectedCompanyId === null ? '#4f46e5' : undefined,
            backgroundColor: selectedCompanyId === null ? '#eef2ff' : undefined,
          }}>
            <input
              type="radio"
              name="company"
              value="none"
              checked={selectedCompanyId === null}
              onChange={() => setSelectedCompanyId(null)}
              className="w-4 h-4"
            />
            <div>
              <p className="font-medium text-slate-900">No Company</p>
              <p className="text-xs text-slate-500">Remove from all companies</p>
            </div>
          </label>

          {/* Company options */}
          {companies.map((company) => (
            <label
              key={company.id}
              className="flex items-center gap-3 p-3 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
              style={{
                borderColor: selectedCompanyId === company.id ? '#4f46e5' : undefined,
                backgroundColor: selectedCompanyId === company.id ? '#eef2ff' : undefined,
              }}
            >
              <input
                type="radio"
                name="company"
                value={company.id}
                checked={selectedCompanyId === company.id}
                onChange={() => setSelectedCompanyId(company.id)}
                className="w-4 h-4"
              />
              <div>
                <p className="font-medium text-slate-900">{company.name}</p>
                <p className="text-xs text-slate-500">{company.slug}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            loading={loading}
            disabled={selectedCompanyId === currentCompanyId}
            className="flex-1"
          >
            Update Company
          </Button>
        </div>
      </div>
    </Modal>
  )
}
