import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Stripe from 'stripe'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion })
}

const PLAN_CONFIG = {
  starter: { seconds: 1800, label: 'Starter' },
  pro: { seconds: 9000, label: 'Pro' },
  studio: { seconds: 30000, label: 'Studio' },
} as const

type PlanId = keyof typeof PLAN_CONFIG

function getSubscriptionPriceId(planId: PlanId): string | undefined {
  const map: Record<PlanId, string | undefined> = {
    starter: process.env.STRIPE_STARTER_PRICE_ID,
    pro: process.env.STRIPE_PRO_PRICE_ID,
    studio: process.env.STRIPE_STUDIO_PRICE_ID,
  }
  return map[planId]
}

function getTopupPriceId(planId: PlanId): string | undefined {
  const map: Record<PlanId, string | undefined> = {
    starter: process.env.STRIPE_TOPUP_STARTER_PRICE_ID,
    pro: process.env.STRIPE_TOPUP_PRO_PRICE_ID,
    studio: process.env.STRIPE_TOPUP_STUDIO_PRICE_ID,
  }
  return map[planId]
}

// POST /api/stripe/checkout — create a Stripe Checkout session for plan subscription or top-up
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { type, planId } = body as { type: 'subscribe' | 'topup'; planId: PlanId }

    if (!type || !planId || !PLAN_CONFIG[planId]) {
      return NextResponse.json({ error: 'Invalid type or planId' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, stripeCustomerId: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: { userId },
      })
      customerId = customer.id
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      })
    }

    const origin = process.env.NEXTAUTH_URL || 'http://localhost:3001'
    const { seconds } = PLAN_CONFIG[planId]

    if (type === 'subscribe') {
      const priceId = getSubscriptionPriceId(planId)
      if (!priceId) {
        return NextResponse.json({ error: 'Price not configured' }, { status: 500 })
      }

      const checkoutSession = await getStripe().checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/pricing?success=true`,
        cancel_url: `${origin}/pricing?cancelled=true`,
        metadata: { userId, plan: planId, monthlySeconds: String(seconds) },
      })

      return NextResponse.json({ url: checkoutSession.url })
    }

    // type === 'topup'
    const priceId = getTopupPriceId(planId)
    if (!priceId) {
      return NextResponse.json({ error: 'Top-up price not configured' }, { status: 500 })
    }

    const checkoutSession = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pricing?topup=true`,
      cancel_url: `${origin}/pricing?cancelled=true`,
      metadata: { userId, type: 'topup', seconds: String(seconds) },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('[stripe/checkout POST]', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
