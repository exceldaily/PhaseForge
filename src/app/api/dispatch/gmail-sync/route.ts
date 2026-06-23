/**
 * GET /api/dispatch/gmail-sync
 * Vercel Cron: runs every 5 minutes.
 * Polls Gmail for emails labeled by each active dispatch board's gmail_label,
 * parses them into Dispatch cards, and marks them processed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  refreshAccessToken,
  getLabels,
  getOrCreateLabel,
  listMessages,
  getMessage,
  modifyLabels,
  extractBody,
  extractHeader,
} from '@/lib/gmail'
import { parseDispatchEmail } from '@/lib/emailParsers'

const LOGGED_LABEL = 'Dispatch/Logged'

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret (or manual trigger with ?secret=)
  const authHeader = req.headers.get('authorization')
  const querySecret = req.nextUrl.searchParams.get('secret')
  const expected = process.env.CRON_SECRET
  if (expected) {
    const provided = authHeader?.replace('Bearer ', '') ?? querySecret
    if (provided !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createAdminClient()

  // ── Fetch all active Gmail configs ─────────────────────────────────────────
  const { data: configs, error: configErr } = await supabase
    .from('dispatch_gmail_config')
    .select('*')
    .eq('is_active', true)

  if (configErr) {
    console.error('[gmail-sync] config fetch error:', configErr)
    return NextResponse.json({ error: configErr.message }, { status: 500 })
  }

  if (!configs?.length) {
    return NextResponse.json({ ok: true, message: 'No active Gmail configs' })
  }

  const results: Array<{ companyId: string; created: number; skipped: number; errors: string[] }> = []

  for (const config of configs) {
    const companyResult = { companyId: config.company_id, created: 0, skipped: 0, errors: [] as string[] }

    try {
      // Refresh access token if expired or close to expiry
      let accessToken = config.access_token as string
      const expiresAt = config.token_expires_at ? new Date(config.token_expires_at) : null
      if (!accessToken || !expiresAt || expiresAt.getTime() < Date.now() + 60_000) {
        const refreshed = await refreshAccessToken(config.refresh_token)
        accessToken = refreshed.access_token
        await supabase.from('dispatch_gmail_config').update({
          access_token: accessToken,
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', config.id)
      }

      // ── Get Gmail labels ──────────────────────────────────────────────────
      const gmailLabels = await getLabels(accessToken)
      const labelNameToId = new Map(gmailLabels.map(l => [l.name.toLowerCase(), l.id]))

      // Ensure the "Dispatch/Logged" label exists
      const loggedLabelObj = await getOrCreateLabel(accessToken, LOGGED_LABEL)
      const loggedLabelId = loggedLabelObj.id

      // ── Fetch boards for this company that have gmail_label set ───────────
      const { data: boards } = await supabase
        .from('dispatch_boards')
        .select('id, gmail_label, gmail_default_column_id')
        .eq('company_id', config.company_id)
        .eq('is_active', true)
        .not('gmail_label', 'is', null)

      if (!boards?.length) continue

      for (const board of boards) {
        const intakeLabelName = board.gmail_label as string
        const intakeLabelId = labelNameToId.get(intakeLabelName.toLowerCase())

        if (!intakeLabelId) {
          companyResult.errors.push(`Label "${intakeLabelName}" not found in Gmail`)
          continue
        }

        // Find the first column to land new cards in
        let columnId: string | null = board.gmail_default_column_id ?? null
        if (!columnId) {
          const { data: cols } = await supabase
            .from('dispatch_columns')
            .select('id')
            .eq('board_id', board.id)
            .order('sort_order', { ascending: true })
            .limit(1)
          columnId = cols?.[0]?.id ?? null
        }

        // ── List messages with this intake label (excluding already logged) ─
        const messageRefs = await listMessages(accessToken, [intakeLabelId], 20)

        for (const ref of messageRefs) {
          try {
            const msg = await getMessage(accessToken, ref.id)

            // Skip if already marked Dispatch/Logged
            if (msg.labelIds.includes(loggedLabelId)) {
              companyResult.skipped++
              continue
            }

            const threadId = msg.threadId
            const subject = extractHeader(msg, 'subject')
            const from = extractHeader(msg, 'from')
            const body = extractBody(msg.payload)

            // Dedup by gmail_thread_id
            const { data: existing } = await supabase
              .from('dispatch_cards')
              .select('id')
              .eq('company_id', config.company_id)
              .eq('gmail_thread_id', threadId)
              .maybeSingle()

            if (existing) {
              // Thread already has a card — mark logged and move on
              await modifyLabels(accessToken, ref.id, [loggedLabelId], [intakeLabelId])
              companyResult.skipped++
              continue
            }

            // Parse the email into card fields
            const parsed = parseDispatchEmail(subject, body, from)

            // Insert the card
            const { data: card, error: cardErr } = await supabase
              .from('dispatch_cards')
              .insert({
                company_id: config.company_id,
                board_id: board.id,
                column_id: columnId,
                store: parsed.store,
                urgency: parsed.urgency,
                sc_number: parsed.sc_number,
                description: parsed.description,
                rack_circuit_case: parsed.rack_circuit_case,
                date_started: parsed.date_started,
                email_sender: parsed.email_sender,
                email_subject: parsed.email_subject,
                gmail_thread_id: threadId,
                last_gmail_msg_id: ref.id,
                last_email_date: new Date(parseInt(msg.internalDate)).toISOString(),
                needs_review: parsed.needs_review,
                source: 'email',
              })
              .select('id')
              .single()

            if (cardErr) {
              companyResult.errors.push(`Card insert failed: ${cardErr.message}`)
              continue
            }

            // Log activity
            await supabase.from('dispatch_activity_logs').insert({
              card_id: card.id,
              company_id: config.company_id,
              actor_type: 'system',
              actor_name: 'Gmail Sync',
              activity_type: 'card_created',
              message: `Card created from email: "${subject}"`,
              email_message_id: ref.id,
              email_sender: from,
              email_subject: subject,
            })

            // Mark the Gmail message as logged
            await modifyLabels(accessToken, ref.id, [loggedLabelId], [intakeLabelId])

            companyResult.created++
          } catch (msgErr) {
            const msg = msgErr instanceof Error ? msgErr.message : String(msgErr)
            companyResult.errors.push(`Message ${ref.id}: ${msg}`)
          }
        }
      }

      // Update last_synced_at
      await supabase.from('dispatch_gmail_config').update({
        last_synced_at: new Date().toISOString(),
      }).eq('id', config.id)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      companyResult.errors.push(`Company sync failed: ${msg}`)
    }

    results.push(companyResult)
  }

  return NextResponse.json({ ok: true, results })
}
