'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addSuggestedDepartmentsAction } from '../opsActions'

export function AddDepartmentsButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="text-right">
      <button className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending}
        onClick={() => start(async () => { const r = await addSuggestedDepartmentsAction(); setMsg(r.ok ? `Added ${r.added} department(s).` : r.error); if (r.ok) router.refresh() })}>
        Add suggested departments
      </button>
      {msg && <p className="mt-1 text-xs text-slate-600">{msg}</p>}
    </div>
  )
}
