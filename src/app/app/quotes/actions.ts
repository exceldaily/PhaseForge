'use server'

// Quotes server actions — ported from InboxFlow, re-scoped to PhaseForge
// companies. Vendor emails send from EACH USER'S OWN Gmail connection; nothing
// ever sends automatically.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canUseTickets } from '@/lib/constants'
import { parseQuoteForm, buildVendorQuoteEmail, type QuoteFormData } from '@/lib/quotes/quoteForm'
import { getUserGmail, gmailSendMessage, gmailGetSignature, gmailThreadReplyAt } from '@/lib/quotes/gmail'

const PATH = '/app/quotes'

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: p } = await supabase
    .from('profiles')
    .select('company_id, full_name, companies(plan, dispatch_enabled)')
    .eq('id', user.id).single()
  if (!p?.company_id) throw new Error('No organization')
  const co = p.companies as { plan?: string; dispatch_enabled?: boolean } | null
  if (!canUseTickets(co?.plan) && !co?.dispatch_enabled) throw new Error('Quotes requires a paid plan')
  return {
    supabase,
    userId: user.id,
    companyId: p.company_id,
    userName: (p as { full_name?: string | null }).full_name ?? 'Me',
  }
}

/* ─────────────────────────── vendors ─────────────────────────── */

export async function addVendor(input: { name: string; email: string; tradeType?: string }) {
  const { supabase, companyId } = await ctx()
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a name and a valid email.' }
  // Return the real row id. The client adds the vendor to its list optimistically,
  // and without the id it holds a placeholder — so editing or deleting a
  // just-added vendor before a refresh matched no row and silently did nothing.
  const { data, error } = await supabase.from('quote_vendors').insert({
    company_id: companyId, name, email, trade_type: (input.tradeType ?? '').trim(),
  }).select('id').single()
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'A vendor with that email already exists.' : error.message }
  }
  revalidatePath(PATH)
  return { ok: true, id: data.id as string }
}

export async function updateVendor(input: {
  id: string; active?: boolean; name?: string; email?: string; tradeType?: string
}) {
  const { supabase, companyId } = await ctx()
  const patch: Record<string, unknown> = {}
  if (typeof input.active === 'boolean') patch.active = input.active
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.tradeType !== undefined) patch.trade_type = input.tradeType.trim()
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase()
  // `select()` so a no-op (row gone, or an id the caller invented) surfaces as
  // an error instead of reporting success while nothing changed.
  const { data, error } = await supabase
    .from('quote_vendors').update(patch)
    .eq('id', input.id).eq('company_id', companyId)
    .select('id')
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'Another vendor already uses that email.' : error.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'That vendor no longer exists — refresh the page and try again.' }
  }
  revalidatePath(PATH)
  return { ok: true }
}

export async function deleteVendor(input: { id: string }) {
  const { supabase, companyId } = await ctx()
  const { data, error } = await supabase
    .from('quote_vendors').delete()
    .eq('id', input.id).eq('company_id', companyId)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'That vendor no longer exists — refresh the page and try again.' }
  }
  revalidatePath(PATH)
  return { ok: true }
}

/* ─────────────────────────── quote intake ─────────────────────────── */

async function insertQuote(form: QuoteFormData) {
  const { supabase, companyId, userId } = await ctx()
  const { data: row, error } = await supabase
    .from('quote_requests')
    .insert({
      company_id: companyId, created_by: userId,
      po_number: form.poNumber, order_type: form.orderType, trade: form.trade,
      tech_name: form.techName, job_number: form.jobNumber, store_number: form.storeNumber,
      request_type: form.requestType, items_text: form.itemsText,
    })
    .select('id').single()
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(PATH)
  return { ok: true as const, quoteId: row.id as string }
}

/** Primary manual intake: attach the form PDF; text is extracted server-side. */
export async function createQuoteFromPdf(formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'Attach a PDF file.' }
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: 'That PDF is over 10 MB.' }
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return { ok: false, error: 'Only PDF files are supported here.' }

  let text = ''
  try {
    const { extractPdfText } = await import('@/lib/quotes/pdfText')
    text = await extractPdfText(Buffer.from(await file.arrayBuffer()))
  } catch (e) {
    const detail = e instanceof Error ? ` (${e.message.slice(0, 120)})` : ''
    return { ok: false, error: `Could not read that PDF${detail}. If it is a scan without text, paste the form text instead.` }
  }
  const form = parseQuoteForm(text)
  if (!form) return { ok: false, error: 'That PDF does not look like one of your quote forms. If it is a scanned image, paste the text instead.' }
  return insertQuote(form)
}

/** Fallback intake: paste the form text (from the email or the PDF). */
export async function createQuoteFromText(input: { text: string }) {
  const form = parseQuoteForm(input.text ?? '')
  if (!form) return { ok: false, error: 'That text does not look like one of your quote forms. Check the paste and try again.' }
  return insertQuote(form)
}

export async function updateQuoteRequest(input: { id: string; patch: Record<string, string | null> }) {
  const { supabase, companyId } = await ctx()
  const allowed = ['po_number', 'trade', 'tech_name', 'job_number', 'store_number', 'items_text', 'notes'] as const
  const patch: Record<string, string | null> = {}
  for (const key of allowed) if (key in input.patch) patch[key] = input.patch[key]
  if (Object.keys(patch).length === 0) return { ok: true }
  await supabase.from('quote_requests').update(patch).eq('id', input.id).eq('company_id', companyId)
  revalidatePath(PATH)
  return { ok: true }
}

export async function deleteQuoteRequest(input: { id: string }) {
  const { supabase, companyId } = await ctx()
  await supabase.from('quote_requests').delete().eq('id', input.id).eq('company_id', companyId)
  revalidatePath(PATH)
  return { ok: true }
}

/** Mark a quote done once all vendor quotes are in — archives it out of the active list. */
export async function completeQuote(input: { id: string }) {
  const { supabase, companyId } = await ctx()
  await supabase.from('quote_requests').update({ status: 'closed' }).eq('id', input.id).eq('company_id', companyId)
  revalidatePath(PATH)
  return { ok: true }
}

/** Pull an archived quote back into the active list at the right stage. */
export async function reopenQuote(input: { id: string }) {
  const { supabase, companyId } = await ctx()
  const { data: sends } = await supabase
    .from('quote_vendor_sends').select('status').eq('quote_request_id', input.id).eq('company_id', companyId)
  const anyReplied = (sends ?? []).some((s) => s.status === 'replied')
  const anySent = (sends ?? []).some((s) => s.status === 'sent' || s.status === 'replied')
  const status = anyReplied ? 'quoted' : anySent ? 'sent' : 'intake'
  await supabase.from('quote_requests').update({ status }).eq('id', input.id).eq('company_id', companyId)
  revalidatePath(PATH)
  return { ok: true }
}

/* ─────────────────────────── gmail connection ─────────────────────────── */

export async function disconnectGmail() {
  const { supabase, userId } = await ctx()
  await supabase.from('user_gmail_accounts').delete().eq('user_id', userId)
  revalidatePath(PATH)
  return { ok: true }
}

/** Re-reads the user's signature from Gmail settings. */
export async function refreshSignature() {
  const { supabase, userId } = await ctx()
  const gmail = await getUserGmail(supabase, userId)
  if (!gmail) return { ok: false, error: 'Connect your Gmail first.' }
  const signature = await gmailGetSignature(gmail.accessToken)
  if (!signature) return { ok: false, error: 'No signature is set on your Gmail account.' }
  await supabase.from('user_gmail_accounts').update({ email_signature: signature }).eq('user_id', userId)
  revalidatePath(PATH)
  return { ok: true }
}

/* ─────────────────────────── outreach ─────────────────────────── */

function formOf(q: Record<string, unknown>): QuoteFormData {
  return {
    poNumber: (q.po_number as string) ?? null, orderType: (q.order_type as string) ?? null,
    trade: (q.trade as string) ?? null, techName: (q.tech_name as string) ?? null,
    jobNumber: (q.job_number as string) ?? null, storeNumber: (q.store_number as string) ?? null,
    requestType: (q.request_type as string) ?? null, itemsText: (q.items_text as string) ?? '',
  }
}

/**
 * Sends the quote inquiry to the selected vendors — one personalized email
 * each, from the CALLER'S OWN Gmail. Only runs when the user clicks Send.
 */
export async function sendQuoteToVendors(input: {
  quoteId: string
  vendorIds: string[]
  bodyOverride?: string | null
}) {
  const { supabase, companyId, userId, userName } = await ctx()
  if (input.vendorIds.length === 0) return { ok: false, sent: 0, failed: 0, error: 'Pick at least one vendor.' }

  const [{ data: quote }, gmail] = await Promise.all([
    supabase.from('quote_requests').select('*').eq('id', input.quoteId).eq('company_id', companyId).single(),
    getUserGmail(supabase, userId),
  ])
  if (!quote) return { ok: false, sent: 0, failed: 0, error: 'Quote not found.' }
  if (!gmail) {
    return { ok: false, sent: 0, failed: 0, error: 'Connect your Gmail on this page first — quotes send from your own address.' }
  }
  const { data: vendors } = await supabase
    .from('quote_vendors').select('*').eq('company_id', companyId).in('id', input.vendorIds)
  if (!vendors || vendors.length === 0) return { ok: false, sent: 0, failed: 0, error: 'No matching vendors.' }

  let sent = 0
  let failed = 0
  for (const vendor of vendors) {
    const built = buildVendorQuoteEmail({
      form: formOf(quote), vendorName: vendor.name, userName,
      bodyOverride: input.bodyOverride ?? null, signatureHtml: gmail.signature,
    })
    try {
      const res = await gmailSendMessage(gmail.accessToken, {
        to: vendor.email, subject: built.subject, text: built.text, html: built.html,
      })
      await supabase.from('quote_vendor_sends').upsert({
        company_id: companyId, quote_request_id: quote.id, vendor_id: vendor.id, sent_by: userId,
        status: 'sent', gmail_message_id: res.messageId, gmail_thread_id: res.threadId,
        sent_at: new Date().toISOString(), error: null,
      }, { onConflict: 'quote_request_id,vendor_id' })
      sent++
    } catch (e) {
      failed++
      await supabase.from('quote_vendor_sends').upsert({
        company_id: companyId, quote_request_id: quote.id, vendor_id: vendor.id, sent_by: userId,
        status: 'failed', error: e instanceof Error ? e.message.slice(0, 300) : 'send failed',
      }, { onConflict: 'quote_request_id,vendor_id' })
    }
  }
  if (sent > 0) {
    await supabase.from('quote_requests').update({ status: 'sent' }).eq('id', quote.id).eq('company_id', companyId)
  }
  revalidatePath(PATH)
  return { ok: failed === 0, sent, failed, error: failed > 0 ? `${failed} send${failed === 1 ? '' : 's'} failed — see vendor list.` : undefined }
}

/**
 * Checks Gmail for vendor replies on this quote's outstanding sends. Reads with
 * the caller's token, so it covers the sends the caller made.
 */
export async function checkQuoteReplies(input: { quoteId: string }) {
  const { supabase, companyId, userId } = await ctx()
  const gmail = await getUserGmail(supabase, userId)
  if (!gmail?.accountEmail) return { ok: false, updated: 0, error: 'Connect your Gmail to check replies.' }

  const { data: sends } = await supabase
    .from('quote_vendor_sends')
    .select('id, gmail_thread_id, status, sent_by')
    .eq('quote_request_id', input.quoteId).eq('company_id', companyId)
    .eq('status', 'sent').eq('sent_by', userId)
  let updated = 0
  for (const send of sends ?? []) {
    if (!send.gmail_thread_id) continue
    const repliedAt = await gmailThreadReplyAt(gmail.accessToken, send.gmail_thread_id, gmail.accountEmail).catch(() => null)
    if (!repliedAt) continue
    await supabase.from('quote_vendor_sends')
      .update({ status: 'replied', replied_at: repliedAt })
      .eq('id', send.id).eq('company_id', companyId)
    updated++
  }
  if (updated > 0) {
    await supabase.from('quote_requests')
      .update({ status: 'quoted' })
      .eq('id', input.quoteId).eq('company_id', companyId).in('status', ['sent', 'ready'])
    revalidatePath(PATH)
  }
  return { ok: true, updated }
}
