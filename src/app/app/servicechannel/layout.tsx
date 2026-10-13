import { requireSc } from '@/lib/servicechannel/server'
import { ScNav } from '@/components/servicechannel/ui'

export const metadata = { title: 'ServiceChannel | PhaseForge' }
export const dynamic = 'force-dynamic'

// Every ServiceChannel page sits under this guard: the organization owner, in
// a company with the module on. Anyone else, direct links included, never
// gets past it.
export default async function ScLayout({ children }: { children: React.ReactNode }) {
  await requireSc()
  return (
    <div className="flex min-h-full flex-col">
      <ScNav />
      <div className="flex-1">{children}</div>
    </div>
  )
}
