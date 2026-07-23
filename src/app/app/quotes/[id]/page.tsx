import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canUseTickets } from '@/lib/constants'
import { buildVendorQuoteEmail } from '@/lib/quotes/quoteForm'
import { QuoteDetailClient, type QuoteDetailData } from '@/components/quotes/QuoteDetailClient'
import type { VendorItem } from '@/components/quotes/QuotesClient'

export const metadata = { title: 'Quote request — PhaseForge' }

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('company_id, full_name, companies(plan, dispatch_enabled)').eq('id', user.id).single()
  if (!profile?.company_id) redirect('/app/dashboard')
  const co = profile.companies as { plan?: string; dispatch_enabled?: boolean } | null
  if (!canUseTickets(co?.plan) && !co?.dispatch_enabled) redirect('/app/dashboard')

  const { data: quote } = await supabase
    .from('quote_requests').select('*').eq('id', id).eq('company_id', profile.company_id).single()
  if (!quote) notFound()

  const [{ data: vendors }, { data: sends }, { data: gmail }] = await Promise.all([
    supabase.from('quote_vendors').select('*').eq('company_id', profile.company_id),
    supabase.from('quote_vendor_sends').select('*').eq('quote_request_id', quote.id).eq('company_id', profile.company_id),
    supabase.from('user_gmail_accounts').select('account_email, is_active').eq('user_id', user.id).maybeSingle(),
  ])

  const vendorById = new Map((vendors ?? []).map((v) => [v.id, v]))
  const preview = buildVendorQuoteEmail({
    form: {
      poNumber: quote.po_number, orderType: quote.order_type, trade: quote.trade,
      techName: quote.tech_name, jobNumber: quote.job_number, storeNumber: quote.store_number,
      requestType: quote.request_type, itemsText: quote.items_text,
    },
    vendorName: '[Vendor]',
    userName: (profile as { full_name?: string | null }).full_name ?? 'Me',
  })

  const data: QuoteDetailData = {
    id: quote.id,
    status: quote.status,
    updatedAt: quote.updated_at,
    createdAt: quote.created_at,
    poNumber: quote.po_number,
    trade: quote.trade,
    techName: quote.tech_name,
    jobNumber: quote.job_number,
    storeNumber: quote.store_number,
    itemsText: quote.items_text,
    previewSubject: preview.subject,
    previewBody: preview.text,
    sends: (sends ?? []).map((s) => ({
      vendorName: vendorById.get(s.vendor_id)?.name ?? 'Removed vendor',
      vendorEmail: vendorById.get(s.vendor_id)?.email ?? '',
      status: s.status,
      sentAt: s.sent_at,
      repliedAt: s.replied_at,
      error: s.error,
    })),
  }
  const vendorItems: VendorItem[] = (vendors ?? []).map((v) => ({
    id: v.id, name: v.name, email: v.email, tradeType: v.trade_type, active: v.active,
  }))

  return <QuoteDetailClient quote={data} vendors={vendorItems} canSend={Boolean(gmail?.is_active)} />
}
