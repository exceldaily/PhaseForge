import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

let stripe: Stripe | null = null
let supabase: any = null

const getStripe = () => {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2026-05-27.dahlia',
    })
  }
  return stripe
}

const getSupabase = () => {
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    // App data lives in the `phaseforge` schema (shared project with ReelFishHelp).
    supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: 'phaseforge' } })
  }
  return supabase
}

const getPlanFromPriceId = (priceId: string): 'free' | 'individual' | 'pro' | 'business' | null => {
  // Map Stripe price IDs to plan types
  // In production, you'd store the mapping in an environment variable or database
  if (priceId === process.env.STRIPE_PRICE_INDIVIDUAL_ID) return 'individual'
  if (priceId === process.env.STRIPE_PRICE_PRO_ID) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_BUSINESS_ID) return 'business'

  // Fallback mapping for test mode
  if (priceId.includes('individual')) return 'individual'
  if (priceId.includes('pro')) return 'pro'
  if (priceId.includes('business')) return 'business'

  return null
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature') || ''
  const stripe = getStripe()
  const supabase = getSupabase()

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    )
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any

        if (!subscription.customer) {
          return NextResponse.json({ received: true })
        }

        // Get customer
        const customer = await stripe.customers.retrieve(
          subscription.customer as string
        )

        if (!customer || customer.deleted) {
          return NextResponse.json({ received: true })
        }

        const companyId = (customer.metadata as any)?.company_id

        if (!companyId) {
          return NextResponse.json({ received: true })
        }

        // Get the price/plan from the subscription
        const item = subscription.items.data[0]
        if (!item?.price) {
          return NextResponse.json({ received: true })
        }

        const plan = getPlanFromPriceId(item.price.id)

        if (!plan) {
          return NextResponse.json({ received: true })
        }

        // Update company
        const { error: updateError } = await supabase
          .from('companies')
          .update({
            plan,
            stripe_subscription_id: subscription.id,
            billing_status: subscription.status === 'past_due' ? 'past_due' : 'active',
            billing_cycle_start: new Date(subscription.current_period_start * 1000)
              .toISOString()
              .split('T')[0],
            billing_cycle_end: new Date(subscription.current_period_end * 1000)
              .toISOString()
              .split('T')[0],
          })
          .eq('id', companyId)

        if (updateError) {
          console.error('Failed to update company:', updateError)
          return NextResponse.json({ error: 'Update failed' }, { status: 500 })
        }

        // Record invoice if payment succeeded
        if (event.type === 'customer.subscription.updated' && subscription.latest_invoice) {
          try {
            const invoice = await stripe.invoices.retrieve(
              subscription.latest_invoice as string
            ) as any

            if (invoice.paid) {
              await supabase
                .from('billing_history')
                .insert({
                  company_id: companyId,
                  stripe_invoice_id: invoice.id,
                  amount_paid: invoice.total,
                  currency: invoice.currency,
                  period_start: new Date(invoice.period_start * 1000)
                    .toISOString()
                    .split('T')[0],
                  period_end: new Date(invoice.period_end * 1000)
                    .toISOString()
                    .split('T')[0],
                  status: invoice.status,
                  paid_at: invoice.paid_at
                    ? new Date(invoice.paid_at * 1000).toISOString()
                    : null,
                })
            }
          } catch (err) {
            console.error('Failed to record invoice:', err)
          }
        }

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any

        if (!subscription.customer) {
          return NextResponse.json({ received: true })
        }

        const customer = await stripe.customers.retrieve(
          subscription.customer as string
        )

        if (!customer || customer.deleted) {
          return NextResponse.json({ received: true })
        }

        const companyId = (customer.metadata as any)?.company_id

        if (!companyId) {
          return NextResponse.json({ received: true })
        }

        // Downgrade to free
        try {
          await supabase
            .from('companies')
            .update({
              plan: 'free',
              stripe_subscription_id: null,
              billing_status: 'canceled',
            })
            .eq('id', companyId)
        } catch (err) {
          console.error('Failed to downgrade company:', err)
        }

        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any

        if (!invoice.customer) {
          return NextResponse.json({ received: true })
        }

        const customer = await stripe.customers.retrieve(
          invoice.customer as string
        )

        if (!customer || customer.deleted) {
          return NextResponse.json({ received: true })
        }

        const companyId = (customer.metadata as any)?.company_id

        if (!companyId) {
          return NextResponse.json({ received: true })
        }

        // Update billing status to active
        try {
          await supabase
            .from('companies')
            .update({ billing_status: 'active' })
            .eq('id', companyId)
        } catch (err) {
          console.error('Failed to update billing status:', err)
        }

        // Record invoice
        try {
          await supabase
            .from('billing_history')
            .insert({
              company_id: companyId,
              stripe_invoice_id: invoice.id,
              amount_paid: invoice.total,
              currency: invoice.currency,
              period_start: new Date(invoice.period_start * 1000)
                .toISOString()
                .split('T')[0],
              period_end: new Date(invoice.period_end * 1000)
                .toISOString()
                .split('T')[0],
              status: invoice.status,
              paid_at: new Date(invoice.paid_at! * 1000).toISOString(),
            })
        } catch (err) {
          console.error('Failed to record invoice:', err)
        }

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any

        if (!invoice.customer) {
          return NextResponse.json({ received: true })
        }

        const customer = await stripe.customers.retrieve(
          invoice.customer as string
        )

        if (!customer || customer.deleted) {
          return NextResponse.json({ received: true })
        }

        const companyId = (customer.metadata as any)?.company_id

        if (!companyId) {
          return NextResponse.json({ received: true })
        }

        // Update billing status to past_due
        try {
          await supabase
            .from('companies')
            .update({ billing_status: 'past_due' })
            .eq('id', companyId)

          // Log admin notification
          console.warn(`Payment failed for company ${companyId}, invoice ${invoice.id}`)
        } catch (err) {
          console.error('Failed to update billing status for failed payment:', err)
        }

        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 })
  }
}
