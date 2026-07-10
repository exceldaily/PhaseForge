'use client'

import { useState } from 'react'
import { Check, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PLAN_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { createCheckoutSession } from '@/app/app/billing/actions'

interface PricingCardsProps {
  currentPlan: string
  billingCycleStart: string | null
  billingCycleEnd: string | null
  companyId: string
  memberCount: number
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    description: 'Perfect for getting started',
    features: [
      '1 board',
      '5 projects',
      '3 team members',
      'Basic Gantt chart',
      'Community support',
    ],
  },
  {
    id: 'individual',
    name: 'Individual',
    price: '$3',
    period: '/month',
    description: 'Solo operators & freelancers',
    features: [
      '10 boards',
      'Unlimited projects',
      'Solo use (1 member)',
      'Crew Schedules',
      'Google Calendar sync',
      'Light & dark mode',
      'Print & reports',
      'Email support',
    ],
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For growing teams',
    features: [
      '10 boards',
      'Unlimited projects',
      '25 team members',
      'Crew Schedules',
      'Google Calendar sync',
      'Light & dark mode',
      'Print & reports',
      'Email support',
    ],
    highlighted: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: '$199',
    period: '/month',
    description: 'For large teams',
    features: [
      'Unlimited boards',
      'Unlimited projects',
      'Unlimited team members',
      'All Pro features',
      'Priority support',
    ],
  },
]

export function PricingCards({
  currentPlan,
  billingCycleStart,
  billingCycleEnd,
  companyId,
  memberCount,
}: PricingCardsProps) {
  const [upgrading, setUpgrading] = useState<string | null>(null)

  // Individual is a solo plan: it only allows 1 member. Hide it entirely for
  // organizations with more than 2 people (it's not a sensible option), and for
  // a 2-person org show it but blocked until they're down to a single member.
  const visiblePlans = PLANS.filter((p) => !(p.id === 'individual' && memberCount > 2))
  const gridCols = visiblePlans.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'

  const handleUpgrade = async (plan: string) => {
    if (plan === currentPlan || plan === 'free') return

    try {
      setUpgrading(plan)
      const url = await createCheckoutSession(companyId, plan as 'individual' | 'pro' | 'business', window.location.href)
      window.location.assign(url)
    } catch (error) {
      alert(`Failed to start checkout: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setUpgrading(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* Current Plan Status */}
      {currentPlan !== 'free' && billingCycleStart && billingCycleEnd && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-indigo-600 font-medium">Current Plan</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1 capitalize">{PLAN_LABELS[currentPlan as keyof typeof PLAN_LABELS]}</h3>
              <p className="text-sm text-slate-600 mt-2">
                Billing cycle: {new Date(billingCycleStart).toLocaleDateString()} — {new Date(billingCycleEnd).toLocaleDateString()}
              </p>
            </div>
            <Badge className="bg-indigo-100 text-indigo-700">Active</Badge>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className={cn('grid gap-6', gridCols)}>
        {visiblePlans.map((plan) => {
          const isCurrent = plan.id === currentPlan
          const isUpgrade = PLANS.findIndex((p) => p.id === plan.id) > PLANS.findIndex((p) => p.id === currentPlan)
          // Solo plan can't be selected while the org has more than one member.
          const individualBlocked = plan.id === 'individual' && memberCount > 1

          return (
            <div
              key={plan.id}
              className={cn(
                'rounded-2xl border-2 transition-all relative',
                isCurrent
                  ? 'border-indigo-600 bg-indigo-50/50'
                  : plan.highlighted
                  ? 'border-amber-200 bg-amber-50/50 transform scale-105'
                  : 'border-slate-200 bg-white',
              )}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-amber-500 text-white">
                    <Zap size={12} className="mr-1" /> Most Popular
                  </Badge>
                </div>
              )}

              <div className="p-6 space-y-6">
                {/* Header */}
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <p className="text-sm text-slate-600 mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                    {plan.period && <span className="text-slate-600 ml-1">{plan.period}</span>}
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      <Check size={16} className="text-emerald-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Button */}
                {isCurrent ? (
                  <Button disabled className="w-full">
                    Current Plan
                  </Button>
                ) : plan.id === 'free' ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Free Forever
                  </Button>
                ) : individualBlocked ? (
                  <div className="space-y-2">
                    <Button variant="secondary" className="w-full" disabled>
                      Remove members to switch
                    </Button>
                    <p className="text-xs text-slate-500 text-center">
                      Individual is a solo plan (1 member). Your workspace has {memberCount} active members — remove the others in Settings → Members first.
                    </p>
                  </div>
                ) : isUpgrade ? (
                  <Button
                    onClick={() => handleUpgrade(plan.id)}
                    loading={upgrading === plan.id}
                    className="w-full"
                  >
                    {plan.id === 'individual' ? 'Switch to Individual' : `Upgrade to ${plan.name}`}
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    Downgrade
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Support note */}
      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
        <p className="text-sm text-slate-700">
          Need something custom? <span className="font-medium text-slate-900">Contact the sales team</span> for Enterprise plans.
        </p>
      </div>
    </div>
  )
}
