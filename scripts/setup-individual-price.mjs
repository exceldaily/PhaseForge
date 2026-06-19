// One-off: create the "PhaseForge Individual" product + $3/mo price in Stripe.
// Idempotent — reuses an existing product/price if already present.
import fs from 'node:fs'
import path from 'node:path'
import Stripe from 'stripe'

// Load STRIPE_SECRET_KEY from .env.local without extra deps.
const envPath = path.join(process.cwd(), '.env.local')
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const key = env.STRIPE_SECRET_KEY
if (!key) throw new Error('STRIPE_SECRET_KEY not found in .env.local')
const mode = key.startsWith('sk_live') ? 'LIVE' : 'TEST'
console.log(`Using Stripe in ${mode} mode`)

const stripe = new Stripe(key, { apiVersion: '2026-05-27.dahlia' })

const PRODUCT_NAME = 'PhaseForge Individual'
const AMOUNT = 300 // $3.00 in cents

// 1. Find or create the product.
const products = await stripe.products.list({ limit: 100, active: true })
let product = products.data.find((p) => p.name === PRODUCT_NAME)
if (product) {
  console.log(`Reusing existing product: ${product.id}`)
} else {
  product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: 'Solo plan — all Pro features for a single user.',
  })
  console.log(`Created product: ${product.id}`)
}

// 2. Find or create a $3/month recurring USD price on that product.
const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 })
let price = prices.data.find(
  (p) =>
    p.unit_amount === AMOUNT &&
    p.currency === 'usd' &&
    p.recurring?.interval === 'month'
)
if (price) {
  console.log(`Reusing existing price: ${price.id}`)
} else {
  price = await stripe.prices.create({
    product: product.id,
    unit_amount: AMOUNT,
    currency: 'usd',
    recurring: { interval: 'month' },
  })
  console.log(`Created price: ${price.id}`)
}

console.log('\n=== RESULT ===')
console.log(`STRIPE_PRICE_INDIVIDUAL_ID=${price.id}`)
