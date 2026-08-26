import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canUseTickets } from '@/lib/constants'
import { QuotesClient, type QuoteListItem, type VendorItem } from '@/components/quotes/QuotesClient'
import type { PricingListItem } from '@/components/quotes/PricingList'
import { computeTotals, type PriceLineKind } from '@/lib/quotes/vendorQuote'

export const metadata = { title: 'Quotes — PhaseForge' }

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('company_id, companies(plan, dispatch_enabled)').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')
  const co = profile.companies as { plan?: string; dispatch_enabled?: boolean } | null
  if (!canUseTickets(co?.plan) && !co?.dispatch_enabled) redirect('/app/dashboard')

  const [{ data: quotes }, { data: vendors }, { data: sends }, { data: gmail }, { data: pricings }, { data: priceLines }] = await Promise.all([
    supabase.from('quote_requests').select('*').eq('company_id', profile.company_id)
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('quote_vendors').select('*').eq('company_id', profile.company_id),
    supabase.from('quote_vendor_sends').select('quote_request_id, status').eq('company_id', profile.company_id),
    supabase.from('user_gmail_accounts').select('account_email, email_signature, is_active').eq('user_id', user.id).maybeSingle(),
    supabase.from('quote_pricings').select('*').eq('company_id', profile.company_id)
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('quote_price_lines').select('pricing_id, kind, qty, unit_cost, markup_pct, taxable')
      .eq('company_id', profile.company_id),
  ])

  const items: QuoteListItem[] = (quotes ?? []).map((q) => {
    const mine = (sends ?? []).filter((s) => s.quote_request_id === q.id)
    const sentCount = mine.filter((s) => s.status === 'sent' || s.status === 'replied').length
    const repliedCount = mine.filter((s) => s.status === 'replied').length
    return {
      id: q.id, status: q.status, poNumber: q.po_number, jobNumber: q.job_number,
      storeNumber: q.store_number, trade: q.trade, techName: q.tech_name,
      itemsText: q.items_text, createdAt: q.created_at,
      sentCount, repliedCount,
      readyToComplete: q.status !== 'closed' && sentCount > 0 && repliedCount === sentCount,
    }
  })
  const vendorItems: VendorItem[] = (vendors ?? []).map((v) => ({
    id: v.id, name: v.name, email: v.email, tradeType: v.trade_type, active: v.active,
  }))

  // Sheet totals are computed here rather than stored, so the list can never
  // show a stale price after a line is edited.
  const linesBySheet = new Map<string, { kind: PriceLineKind; qty: number; unitCost: number; markupPct: number | null; taxable: boolean }[]>()
  for (const l of priceLines ?? []) {
    const list = linesBySheet.get(l.pricing_id) ?? []
    list.push({
      kind: l.kind as PriceLineKind, qty: Number(l.qty), unitCost: Number(l.unit_cost),
      markupPct: l.markup_pct === null ? null : Number(l.markup_pct), taxable: l.taxable,
    })
    linesBySheet.set(l.pricing_id, list)
  }
  const pricingItems: PricingListItem[] = (pricings ?? []).map((p) => {
    const rows = (linesBySheet.get(p.id) ?? []).map((l) => ({ ...l, description: '' }))
    const t = computeTotals(rows, {
      defaultMarkupPct: Number(p.default_markup_pct), taxPct: Number(p.tax_pct),
    })
    return {
      id: p.id, title: p.title, vendorName: p.vendor_name, jobNumber: p.job_number,
      customerName: p.customer_name, status: p.status, lineCount: rows.length,
      cost: t.cost, total: t.total, marginPct: t.marginPct, createdAt: p.created_at,
    }
  })

  return (
    <QuotesClient
      quotes={items}
      pricings={pricingItems}
      vendors={vendorItems}
      gmailEmail={gmail?.is_active ? (gmail.account_email ?? null) : null}
      hasSignature={Boolean(gmail?.email_signature)}
    />
  )
}
