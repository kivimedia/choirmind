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

// GET /api/admin/refund?userId=X — list recent charges for a user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const userId = new URL(request.url).searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, name: true, email: true },
    })

    if (!user?.stripeCustomerId) {
      return NextResponse.json({ charges: [] })
    }

    const charges = await getStripe().charges.list({
      customer: user.stripeCustomerId,
      limit: 20,
    })

    const result = charges.data.map((c) => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      refunded: c.refunded,
      amountRefunded: c.amount_refunded,
      created: c.created,
      description: c.description,
      receiptUrl: c.receipt_url,
    }))

    return NextResponse.json({ charges: result, userName: user.name, userEmail: user.email })
  } catch (error) {
    console.error('[admin/refund GET]', error)
    return NextResponse.json({ error: 'Failed to fetch charges' }, { status: 500 })
  }
}

// POST /api/admin/refund — issue a refund
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { chargeId, amount, reason } = body as {
      chargeId: string
      amount?: number
      reason?: string
    }

    if (!chargeId) {
      return NextResponse.json({ error: 'chargeId required' }, { status: 400 })
    }

    const refundParams: Stripe.RefundCreateParams = {
      charge: chargeId,
      reason: (reason as Stripe.RefundCreateParams['reason']) || 'requested_by_customer',
    }

    if (amount && amount > 0) {
      refundParams.amount = amount
    }

    const refund = await getStripe().refunds.create(refundParams)

    return NextResponse.json({
      id: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    })
  } catch (error) {
    console.error('[admin/refund POST]', error)
    const message = error instanceof Stripe.errors.StripeError ? error.message : 'Failed to issue refund'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
