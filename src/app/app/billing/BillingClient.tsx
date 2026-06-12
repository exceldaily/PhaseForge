'use client'

import { useState } from 'react'
import { CreditCard, Activity, FileText } from 'lucide-react'
import { PricingCards } from '@/components/billing/PricingCards'
import { UsageWidget } from '@/components/billing/UsageWidget'
import { InvoiceHistory } from '@/components/billing/InvoiceHistory'
import { cn } from '@/lib/utils'

type Tab = 'plan' | 'usage' | 'invoices'

interface Invoice {
  id: string
  stripe_invoice_id: string | null
  amount_paid: number | null
  currency: string
  period_start: string | null
  period_end: string | null
  status: string | null
  paid_at: string | null
  created_at: string
}

interface BillingClientProps {
  companyId: string
  currentPlan: string
  billingStatus: string
  billingCycleStart: string | null
  billingCycleEnd: string | null
  usage: {
    projects: number
    boards: number
    members: number
  }
  invoices: Invoice[]
}

const TABS = [
  { id: 'plan' as const, label: 'Plan', icon: CreditCard },
  { id: 'usage' as const, label: 'Usage', icon: Activity },
  { id: 'invoices' as const, label: 'Invoices', icon: FileText },
]

export function BillingClient({
  companyId,
  currentPlan,
  billingStatus,
  billingCycleStart,
  billingCycleEnd,
  usage,
  invoices,
}: BillingClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('plan')

  return (
    <div>
      {/* Status Badge */}
      {billingStatus === 'past_due' && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            ⚠️ Your subscription payment is overdue. Please update your payment method to avoid service interruption.
          </p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-8 border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-0">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors',
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300'
                )}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'plan' && (
          <PricingCards
            currentPlan={currentPlan}
            billingCycleStart={billingCycleStart}
            billingCycleEnd={billingCycleEnd}
            companyId={companyId}
          />
        )}

        {activeTab === 'usage' && (
          <UsageWidget usage={usage} currentPlan={currentPlan} />
        )}

        {activeTab === 'invoices' && (
          <InvoiceHistory invoices={invoices} />
        )}
      </div>
    </div>
  )
}
