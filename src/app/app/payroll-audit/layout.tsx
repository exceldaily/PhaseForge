import { requirePayrollAudit } from '@/lib/payroll-audit/server'

export const metadata = { title: 'Payroll Audit | PhaseForge' }
export const dynamic = 'force-dynamic'

// Owners and administrators of a company with the module on. A direct link
// from anyone else, or a signed-out visitor, never gets past this.
export default async function PayrollAuditLayout({ children }: { children: React.ReactNode }) {
  await requirePayrollAudit()
  return <>{children}</>
}
