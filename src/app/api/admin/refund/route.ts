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

// POST /api/admin/refund — issue a refund and deduct purchased minutes
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { chargeId, amount, reason, userId } = body as {
      chargeId: string
      amount?: number
      reason?: string
      userId?: string
    }

    if (!chargeId) {
      return NextResponse.json({ error: 'chargeId required' }, { status: 400 })
    }

    const stripe = getStripe()

    const refundParams: Stripe.RefundCreateParams = {
      charge: chargeId,
      reason: (reason as Stripe.RefundCreateParams['reason']) || 'requested_by_customer',
    }

    if (amount && amount > 0) {
      refundParams.amount = amount
    }

    const refund = await stripe.refunds.create(refundParams)

    // --- Deduct purchased minutes from user quota ---
    let deductedSeconds = 0
    try {
      // Resolve user: prefer explicit userId, fall back to charge's customer
      let targetUserId = userId
      const charge = await stripe.charges.retrieve(chargeId)

      if (!targetUserId && charge.customer) {
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: charge.customer as string },
          select: { id: true },
        })
        targetUserId = user?.id
      }

      if (targetUserId) {
        const quota = await prisma.userVocalQuota.findUnique({
          where: { userId: targetUserId },
        })

        if (quota) {
          // Determine how many seconds this charge originally purchased
          let purchasedSeconds = 0

          if (charge.payment_intent) {
            const sessions = await stripe.checkout.sessions.list({
              payment_intent: charge.payment_intent as string,
              limit: 1,
            })
            const cs = sessions.data[0]
            if (cs?.metadata?.seconds) {
              // Top-up purchase
              purchasedSeconds = parseInt(cs.metadata.seconds, 10)
            } else if (cs?.metadata?.monthlySeconds) {
              // Subscription first payment
              purchasedSeconds = parseInt(cs.metadata.monthlySeconds, 10)
            }
          }

          // Fallback for renewal invoices (no checkout session)
          if (purchasedSeconds === 0 && quota.monthlySecondsLimit) {
            purchasedSeconds = quota.monthlySecondsLimit
          }

          if (purchasedSeconds > 0) {
            // For partial refunds, scale proportionally
            const isPartial = amount && amount > 0 && amount < charge.amount
            const secondsToDeduct = isPartial
              ? Math.ceil(purchasedSeconds * amount / charge.amount)
              : purchasedSeconds

            // Clamp so purchasedSeconds doesn't go below 0
            deductedSeconds = Math.min(secondsToDeduct, quota.purchasedSeconds)
            if (deductedSeconds > 0) {
              await prisma.userVocalQuota.update({
                where: { userId: targetUserId },
                data: { purchasedSeconds: { decrement: deductedSeconds } },
              })
              console.log(
                `[admin/refund] Deducted ${deductedSeconds}s from user ${targetUserId} (charge ${chargeId})`,
              )
            }
          }
        }
      }
    } catch (quotaErr) {
      console.error('[admin/refund] Failed to deduct minutes after refund:', quotaErr)
    }

    return NextResponse.json({
      id: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      deductedSeconds,
    })
  } catch (error) {
    console.error('[admin/refund POST]', error)
    const message = error instanceof Stripe.errors.StripeError ? error.message : 'Failed to issue refund'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
