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

// POST /api/stripe/choir-checkout
// Director-only: create a Stripe Checkout session for choir subscription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { choirId } = body

    if (!choirId) {
      return NextResponse.json({ error: 'choirId required' }, { status: 400 })
    }

    // Verify director access
    const membership = await prisma.choirMember.findUnique({
      where: { userId_choirId: { userId, choirId } },
    })
    if (!membership || membership.role !== 'director') {
      return NextResponse.json({ error: 'Director access required' }, { status: 403 })
    }

    // Get or create Stripe customer
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, email: true, name: true },
    })

    let customerId = user?.stripeCustomerId

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user?.email ?? session.user.email,
        name: user?.name ?? undefined,
        metadata: { userId, choirId },
      })
      customerId = customer.id
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      })
    }

    const priceId = process.env.STRIPE_CHOIR_PRICE_ID
    if (!priceId) {
      return NextResponse.json({ error: 'Choir pricing not configured' }, { status: 500 })
    }

    const origin = request.nextUrl.origin

    const checkoutSession = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/director?subscribed=true`,
      cancel_url: `${origin}/director/pricing`,
      metadata: { userId, choirId, type: 'choir' },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('[stripe/choir-checkout POST]', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
