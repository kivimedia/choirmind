import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/vocal-analysis/quota
// Return user's quota status. Creates default quota if none exists.
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    let quota = await prisma.userVocalQuota.findUnique({
      where: { userId },
    })

    if (!quota) {
      quota = await prisma.userVocalQuota.create({
        data: {
          userId,
          freeSecondsUsed: 0,
          freeSecondsLimit: 3600,
        },
      })
    }

    const isSubscribed = !!(quota.stripeCurrentPeriodEnd
      && new Date(quota.stripeCurrentPeriodEnd) > new Date())

    return NextResponse.json({
      freeSecondsUsed: quota.freeSecondsUsed,
      freeSecondsLimit: quota.freeSecondsLimit,
      freeSecondsRemaining: Math.max(0, quota.freeSecondsLimit - quota.freeSecondsUsed),
      subscriptionTier: quota.subscriptionTier,
      subscriptionExpiresAt: quota.subscriptionExpiresAt ?? quota.stripeCurrentPeriodEnd,
      isSubscribed,
    })
  } catch (error) {
    console.error('[vocal-analysis/quota GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
