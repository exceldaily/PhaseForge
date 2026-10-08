import { requirePm } from '@/lib/pm/server'
import { PmNav } from '@/components/pm/ui'

export const metadata = { title: 'Preventative Maintenance | PhaseForge' }
export const dynamic = 'force-dynamic'

// Every Preventative Maintenance page sits under this guard: a signed-out
// visitor, or a company without the module switched on, never gets past it.
export default async function PmLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePm()
  return (
    <div className="flex min-h-full flex-col">
      <PmNav role={ctx.role} />
      <div className="flex-1">{children}</div>
    </div>
  )
}
