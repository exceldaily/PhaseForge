'use client'

import { PLAN_LIMITS } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface UsageWidgetProps {
  usage: {
    projects: number
    boards: number
    members: number
  }
  currentPlan: string
}

export function UsageWidget({ usage, currentPlan }: UsageWidgetProps) {
  const limits = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free

  const getUsagePercentage = (current: number, limit: number | string): number => {
    if (typeof limit === 'string' || limit === 0) return 0
    return Math.round((current / limit) * 100)
  }

  const getUsageColor = (percentage: number): string => {
    if (percentage < 50) return 'bg-emerald-500'
    if (percentage < 80) return 'bg-amber-500'
    return 'bg-rose-500'
  }

  const usageItems = [
    { label: 'Projects', current: usage.projects, limit: limits.projects },
    { label: 'Boards', current: usage.boards, limit: limits.boards },
    { label: 'Team Members', current: usage.members, limit: limits.members },
  ]

  return (
    <div className="space-y-8">
      <div className="p-6 rounded-2xl bg-blue-50 border border-blue-200">
        <h3 className="text-lg font-semibold text-slate-900">Current Usage</h3>
        <p className="text-sm text-slate-600 mt-1">
          You're using {usage.projects} of {limits.projects === 0 ? '∞' : limits.projects} projects
        </p>
      </div>

      <div className="space-y-6">
        {usageItems.map((item) => {
          const percentage = getUsagePercentage(item.current, item.limit)
          const isUnlimited = item.limit === 0
          const isFull = !isUnlimited && item.current >= item.limit

          return (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-900">{item.label}</label>
                <span className={cn('text-sm font-semibold', isFull ? 'text-rose-600' : 'text-slate-600')}>
                  {item.current} / {isUnlimited ? '∞' : item.limit}
                </span>
              </div>
              {!isUnlimited && (
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={cn('h-full transition-all rounded-full', getUsageColor(percentage))}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              )}
              {isUnlimited && (
                <div className="text-xs text-emerald-600 font-medium">
                  ✓ Unlimited for your plan
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Upgrade CTA if approaching limits */}
      {usage.projects > limits.projects * 0.8 && limits.projects > 0 && currentPlan === 'free' && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm font-medium text-amber-900">
            🚀 You're nearing your project limit. Upgrade to Pro for 10 boards and unlimited projects.
          </p>
        </div>
      )}
    </div>
  )
}
