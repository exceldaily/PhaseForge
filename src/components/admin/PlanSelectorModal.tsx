'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { updateCompanyPlan } from '@/app/admin/actions'
import { PLAN_LABELS } from '@/lib/constants'

interface PlanSelectorModalProps {
  open: boolean
  onClose: () => void
  companyId: string
  companyName: string
  currentPlan: string
  onSuccess?: (newPlan: string) => void
}

const PLANS = ['free', 'pro', 'business', 'enterprise'] as const
type Plan = (typeof PLANS)[number]

export function PlanSelectorModal({
  open,
  onClose,
  companyId,
  companyName,
  currentPlan,
  onSuccess,
}: PlanSelectorModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(
    PLANS.includes(currentPlan as Plan) ? (currentPlan as Plan) : 'free'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (selectedPlan === currentPlan) {
      onClose()
      return
    }

    try {
      setLoading(true)
      setError('')
      await updateCompanyPlan(companyId, selectedPlan, 'Admin override')
      onSuccess?.(selectedPlan)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update plan')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setSelectedPlan(PLANS.includes(currentPlan as Plan) ? (currentPlan as Plan) : 'free')
    setError('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Change Plan</h3>
          <p className="text-sm text-slate-600 mt-1">{companyName}</p>
        </div>

        <div className="space-y-2">
          {PLANS.map((plan) => (
            <label
              key={plan}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <input
                type="radio"
                name="plan"
                value={plan}
                checked={selectedPlan === plan}
                onChange={(e) => setSelectedPlan(e.target.value as Plan)}
                disabled={loading}
                className="h-4 w-4 text-indigo-600"
              />
              <div className="flex-1">
                <div className="font-medium text-slate-900 capitalize">{PLAN_LABELS[plan as keyof typeof PLAN_LABELS]}</div>
                <div className="text-xs text-slate-500">
                  {plan === 'free' && '1 board, 5 projects, 3 members'}
                  {plan === 'pro' && '10 boards, unlimited projects, 25 members'}
                  {plan === 'business' && 'Unlimited everything'}
                  {plan === 'enterprise' && 'Unlimited everything + support'}
                </div>
              </div>
              {plan === currentPlan && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">Current</span>
              )}
            </label>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            loading={loading}
            disabled={selectedPlan === currentPlan || loading}
          >
            Update Plan
          </Button>
        </div>
      </div>
    </Modal>
  )
}
