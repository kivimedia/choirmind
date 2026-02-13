import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import Stripe from 'stripe'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion })
}

// POST /api/stripe/webhook — handle Stripe webhook events
export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        if (!userId) break

        const subscriptionType = session.metadata?.type

        if (subscriptionType === 'choir') {
          // Choir subscription (director) — keep existing logic
          const choirId = session.metadata?.choirId
          if (choirId && session.subscription) {
            const subscription = await getStripe().subscriptions.retrieve(session.subscription as string)
            await prisma.choir.update({
              where: { id: choirId },
              data: {
                stripeSubscriptionId: subscription.id,
                stripeCurrentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
              },
            })
          }
        } else if (subscriptionType === 'topup') {
          // One-time top-up purchase
          const seconds = parseInt(session.metadata?.seconds || '0', 10)
          if (seconds > 0) {
            await prisma.userVocalQuota.upsert({
              where: { userId },
              create: {
                userId,
                freeSecondsUsed: 0,
                freeSecondsLimit: 3600,
                purchasedSeconds: seconds,
              },
              update: {
                purchasedSeconds: { increment: seconds },
              },
            })
          }
        } else if (session.subscription) {
          // Plan subscription (starter/pro/studio)
          const plan = session.metadata?.plan
          const monthlySeconds = parseInt(session.metadata?.monthlySeconds || '0', 10)
          const subscription = await getStripe().subscriptions.retrieve(session.subscription as string)

          await prisma.userVocalQuota.upsert({
            where: { userId },
            create: {
              userId,
              freeSecondsUsed: 0,
              freeSecondsLimit: 3600,
              plan: plan || null,
              monthlySecondsLimit: monthlySeconds,
              purchasedSeconds: monthlySeconds, // first month's credits
              stripeSubscriptionId: subscription.id,
              stripeCurrentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
              stripePriceId: subscription.items.data[0]?.price.id,
            },
            update: {
              plan: plan || null,
              monthlySecondsLimit: monthlySeconds,
              purchasedSeconds: { increment: monthlySeconds }, // first month's credits
              stripeSubscriptionId: subscription.id,
              stripeCurrentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
              stripePriceId: subscription.items.data[0]?.price.id,
            },
          })
        }
        break
      }

      case 'invoice.paid': {
        // Subscription renewal — add monthly rollover credits
        const invoice = event.data.object as Stripe.Invoice
        const invoiceSubId = (invoice as unknown as { subscription: string | null }).subscription
        if (!invoiceSubId) break

        // Skip the first invoice (already handled by checkout.session.completed)
        const billingReason = (invoice as unknown as { billing_reason: string | null }).billing_reason
        if (billingReason === 'subscription_create') break

        const subscription = await getStripe().subscriptions.retrieve(invoiceSubId)
        const customerId = invoice.customer as string

        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        })
        if (!user) break

        const quota = await prisma.userVocalQuota.findUnique({
          where: { userId: user.id },
        })
        if (!quota || !quota.monthlySecondsLimit) break

        // Rollover: add monthly credits to purchased pool
        await prisma.userVocalQuota.update({
          where: { userId: user.id },
          data: {
            purchasedSeconds: { increment: quota.monthlySecondsLimit },
            stripeCurrentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
          },
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Check if this is a choir subscription
        const choir = await prisma.choir.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        })
        if (choir) {
          await prisma.choir.update({
            where: { id: choir.id },
            data: {
              stripeSubscriptionId: null,
              stripeCurrentPeriodEnd: null,
            },
          })
          break
        }

        // Individual plan cancellation — keep purchased minutes, clear plan
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        })
        if (!user) break

        await prisma.userVocalQuota.update({
          where: { userId: user.id },
          data: {
            plan: null,
            monthlySecondsLimit: 0,
            stripeSubscriptionId: null,
            stripeCurrentPeriodEnd: null,
            stripePriceId: null,
            // Do NOT clear purchasedSeconds — user keeps accumulated minutes
          },
        })
        break
      }
    }
  } catch (error) {
    console.error('[stripe/webhook] Event processing error:', error)
  }

  return NextResponse.json({ received: true })
}
