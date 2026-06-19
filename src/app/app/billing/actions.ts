'use server'

import { createClient } from '@/lib/supabase/server'
import { stripe, getOrCreateStripeCustomer, createCheckoutSession as createStripeCheckout, getCustomerPortalUrl } from '@/lib/stripe'

export async function createCheckoutSession(
  companyId: string,
  planType: 'individual' | 'pro' | 'business',
  returnUrl: string
): Promise<string> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    // Get company info
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (!company) {
      throw new Error('Company not found')
    }

    // Verify user belongs to this company
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profile?.company_id !== companyId) {
      throw new Error('Unauthorized')
    }

    // Individual is a solo plan (1 member). Block the switch while the org still
    // has other members so a subscription can't start over its own limit.
    if (planType === 'individual') {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true)
      if ((count ?? 0) > 1) {
        throw new Error(
          `The Individual plan is for a single user. Your workspace has ${count} active members — remove the others in Settings → Members before switching.`
        )
      }
    }

    // Get or create Stripe customer
    let customer: any = company.stripe_customer_id
      ? await stripe.customers.retrieve(company.stripe_customer_id)
      : null

    if (!customer) {
      customer = await getOrCreateStripeCustomer(companyId, company.name, user.email)

      // Save customer ID to company
      await supabase
        .from('companies')
        .update({ stripe_customer_id: customer.id })
        .eq('id', companyId)
    }

    // Create checkout session
    const session = await createStripeCheckout(customer.id, planType, returnUrl)

    return session.url || ''
  } catch (error) {
    console.error('Error creating checkout session:', error)
    throw error
  }
}

export async function getCustomerPortalSession(
  companyId: string,
  returnUrl: string
): Promise<string> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    // Verify user belongs to this company
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profile?.company_id !== companyId) {
      throw new Error('Unauthorized')
    }

    // Get company
    const { data: company } = await supabase
      .from('companies')
      .select('stripe_customer_id')
      .eq('id', companyId)
      .single()

    if (!company?.stripe_customer_id) {
      throw new Error('No Stripe customer found')
    }

    // Get portal URL
    const portalUrl = await getCustomerPortalUrl(company.stripe_customer_id, returnUrl)
    return portalUrl
  } catch (error) {
    console.error('Error getting customer portal:', error)
    throw error
  }
}
