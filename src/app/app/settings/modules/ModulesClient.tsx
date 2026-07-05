'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setModuleEnabled } from './actions'
import { OpsPageHeader } from '@/components/operations/shared'
import { cn } from '@/lib/utils'

interface ModuleRow {
  key: string
  label: string
  description: string
  enabled: boolean
}

export function ModulesClient({ modules }: { modules: ModuleRow[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(modules.map((m) => [m.key, m.enabled]))
  )
  const [error, setError] = useState<string | null>(null)

  const toggle = (key: string) => {
    const next = !state[key]
    setState((s) => ({ ...s, [key]: next }))
    startTransition(async () => {
      const res = await setModuleEnabled(key, next)
      if (res?.error) {
        setState((s) => ({ ...s, [key]: !next }))
        setError(res.error)
      } else {
        setError(null)
        router.refresh()
      }
    })
  }

  return (
    <div>
      <OpsPageHeader
        title="Modules"
        subtitle="Enable only what your organization uses. Disabled modules disappear from navigation and their pages and data become inaccessible — including direct links."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="space-y-2">
        {modules.map((m) => (
          <div
            key={m.key}
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{m.label}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{m.description}</p>
            </div>
            <button
              role="switch"
              aria-checked={state[m.key]}
              onClick={() => toggle(m.key)}
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                state[m.key] ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                  state[m.key] ? 'translate-x-5.5 left-0' : 'left-0.5'
                )}
                style={{ transform: state[m.key] ? 'translateX(22px)' : undefined }}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
