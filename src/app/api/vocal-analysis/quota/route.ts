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

    // Check choir subscription
    const choirMemberships = await prisma.choirMember.findMany({
      where: { userId },
      select: {
        choir: {
          select: { stripeCurrentPeriodEnd: true },
        },
      },
    })
    const hasChoirSubscription = choirMemberships.some(
      (m) => m.choir.stripeCurrentPeriodEnd && new Date(m.choir.stripeCurrentPeriodEnd) > new Date()
    )

    const totalAllowance = quota.freeSecondsLimit + (quota.purchasedSeconds ?? 0)
    const totalRemaining = Math.max(0, totalAllowance - quota.freeSecondsUsed)

    return NextResponse.json({
      freeSecondsUsed: quota.freeSecondsUsed,
      freeSecondsLimit: quota.freeSecondsLimit,
      purchasedSeconds: quota.purchasedSeconds ?? 0,
      totalAllowance,
      totalRemaining,
      plan: quota.plan ?? null,
      monthlySecondsLimit: quota.monthlySecondsLimit ?? 0,
      hasChoirSubscription,
      canTopUp: true,
    })
  } catch (error) {
    console.error('[vocal-analysis/quota GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
