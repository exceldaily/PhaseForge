import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canUseTickets } from '@/lib/constants'
import { PricingDetailClient, type PricingLine, type PricingSheet } from '@/components/quotes/PricingDetailClient'
import type { PriceLineKind } from '@/lib/quotes/vendorQuote'

export const metadata = { title: 'Quote pricing — PhaseForge' }

export default async function QuotePricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('company_id, companies(plan, dispatch_enabled)').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')
  const co = profile.companies as { plan?: string; dispatch_enabled?: boolean } | null
  if (!canUseTickets(co?.plan) && !co?.dispatch_enabled) redirect('/app/dashboard')

  const [{ data: sheet }, { data: lines }] = await Promise.all([
    supabase.from('quote_pricings').select('*').eq('id', id).eq('company_id', profile.company_id).maybeSingle(),
    supabase.from('quote_price_lines').select('*').eq('pricing_id', id).eq('company_id', profile.company_id).order('sort_order'),
  ])
  if (!sheet) notFound()

  const head: PricingSheet = {
    id: sheet.id,
    title: sheet.title,
    vendorName: sheet.vendor_name,
    quoteNumber: sheet.quote_number,
    jobNumber: sheet.job_number,
    customerName: sheet.customer_name,
    notes: sheet.notes,
    status: sheet.status,
    defaultMarkupPct: Number(sheet.default_markup_pct),
    taxPct: Number(sheet.tax_pct),
    sourceFileName: sheet.source_file_name,
    sourceTotal: sheet.source_total === null ? null : Number(sheet.source_total),
  }
  const rows: PricingLine[] = (lines ?? []).map((l) => ({
    id: l.id,
    kind: l.kind as PriceLineKind,
    description: l.description,
    qty: Number(l.qty),
    unit: l.unit,
    unitCost: Number(l.unit_cost),
    markupPct: l.markup_pct === null ? null : Number(l.markup_pct),
    taxable: l.taxable,
  }))

  return <PricingDetailClient sheet={head} lines={rows} />
}
