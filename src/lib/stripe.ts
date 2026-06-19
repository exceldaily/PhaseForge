import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-05-27.dahlia',
})

// Plan pricing in cents (used as a fallback only if no price ID is configured)
export const PLAN_PRICING: Record<string, number> = {
  individual: 300,   // $3/month
  pro: 4900,         // $49/month
  business: 19900,   // $199/month
}

// Stripe Price IDs created in the Stripe dashboard. Using these directly is
// the source of truth for amount/interval — no separate product IDs needed.
export const STRIPE_PRICE_IDS: Record<string, string | undefined> = {
  individual: process.env.STRIPE_PRICE_INDIVIDUAL_ID,
  pro: process.env.STRIPE_PRICE_PRO_ID,
  business: process.env.STRIPE_PRICE_BUSINESS_ID,
}

export async function getOrCreateStripeCustomer(
  companyId: string,
  companyName: string,
  email?: string
) {
  // In a real app, you'd store stripe_customer_id in the companies table
  // For now, we'll create or retrieve based on metadata
  const customers = await stripe.customers.list({
    limit: 1,
    expand: ['data.subscriptions'],
  })

  const existing = customers.data.find(
    (c) => c.metadata?.company_id === companyId
  )

  if (existing) {
    return existing
  }

  // Create new customer
  return stripe.customers.create({
    name: companyName,
    email: email,
    metadata: {
      company_id: companyId,
    },
  })
}

export async function createCheckoutSession(
  customerId: string,
  planType: 'individual' | 'pro' | 'business',
  returnUrl: string
) {
  const priceId = STRIPE_PRICE_IDS[planType]

  // Prefer the configured Stripe Price (real product/price in the dashboard).
  // Fall back to an inline price only if no price ID is configured.
  const planLabels = { individual: 'Individual', pro: 'Pro', business: 'Business' }
  const lineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        price_data: {
          currency: 'usd',
          product_data: { name: `PhaseForge ${planLabels[planType]}` },
          unit_amount: PLAN_PRICING[planType],
          recurring: { interval: 'month' as const },
        },
        quantity: 1,
      }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [lineItem],
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: returnUrl,
  })

  return session
}

export async function getCustomerPortalUrl(
  customerId: string,
  returnUrl: string
) {
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })

  return portalSession.url
}

export async function getSubscription(subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  })
}

export async function listInvoices(customerId: string) {
  return stripe.invoices.list({
    customer: customerId,
    limit: 12,
  })
}
