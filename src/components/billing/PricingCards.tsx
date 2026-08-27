'use client'

import { useState } from 'react'
import { Check, Mail, Sparkles, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PLAN_LABELS, SALES_EMAIL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { createCheckoutSession } from '@/app/app/billing/actions'

interface PricingCardsProps {
  /** Shown to sales so a reply already knows who is asking. */
  companyName?: string
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
  {
    id: 'business_plus',
    name: 'Business Plus',
    price: "Let's talk",
    description: 'Built around how your company works',
    // Priced per company because the work is scoped per company, so this card
    // opens an email rather than a checkout.
    contact: true,
    features: [
      'Everything in Business',
      'Custom fields, stages & workflows',
      'Forms and reports built to your process',
      'Your terminology throughout',
      'Integrations with the tools you already use',
      'Onboarding and training for your crews',
      'A direct line for changes',
    ],
  },
]

export function PricingCards({
  companyName,
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
  const gridCols = visiblePlans.length >= 5 ? 'lg:grid-cols-3 xl:grid-cols-5'
    : visiblePlans.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'

  // A quoted plan has no Stripe price; the mailto below is its only path.
  const inquiryHref = (planName: string) => {
    const subject = `${planName} enquiry${companyName ? ` — ${companyName}` : ''}`
    const body = [
      `We would like to hear more about ${planName}.`,
      '',
      companyName ? `Company: ${companyName}` : '',
      `Team size: ${memberCount} ${memberCount === 1 ? 'person' : 'people'}`,
      `Current plan: ${PLAN_LABELS[currentPlan] ?? currentPlan}`,
      '',
      'What we would like customized:',
      '',
    ].filter(Boolean).join(String.fromCharCode(10))
    return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

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
                  : plan.contact
                  ? 'border-slate-900 bg-slate-50'
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
              {plan.contact && !isCurrent && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="whitespace-nowrap bg-slate-900 text-white">
                    <Sparkles size={12} className="mr-1" /> Made for you
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
                ) : plan.contact ? (
                  <div className="space-y-2">
                    <a
                      href={inquiryHref(plan.name)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                    >
                      <Mail size={15} /> Email us about {plan.name}
                    </a>
                    <p className="text-center text-xs text-slate-500">
                      Tell us how your company works and we will scope it and quote it. Nothing is charged from this page.
                    </p>
                  </div>
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
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          Need the app to match how your company actually works? That is{' '}
          <span className="font-medium text-slate-900">Business Plus</span> — email{' '}
          <a href={inquiryHref('Business Plus')} className="font-medium text-indigo-600 underline">
            {SALES_EMAIL}
          </a>{' '}
          and tell us what you need. We scope it, quote it, and build it.
        </p>
      </div>
    </div>
  )
}
