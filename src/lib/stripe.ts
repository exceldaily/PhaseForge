import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-05-27.dahlia',
})

// Plan pricing in cents (for Stripe API)
export const PLAN_PRICING: Record<string, number> = {
  pro: 4900,      // $49/month
  business: 19900, // $199/month
}

// Stripe product IDs (these should be created in Stripe dashboard)
// For test mode, these can be test product IDs
export const STRIPE_PRODUCT_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRODUCT_PRO_ID || 'prod_test_pro',
  business: process.env.STRIPE_PRODUCT_BUSINESS_ID || 'prod_test_business',
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
  planType: 'pro' | 'business',
  returnUrl: string
) {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product: STRIPE_PRODUCT_IDS[planType],
          unit_amount: PLAN_PRICING[planType],
          recurring: {
            interval: 'month',
          },
        },
        quantity: 1,
      },
    ],
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
