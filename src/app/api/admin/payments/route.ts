import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/admin/payments?search=X&limit=50
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        stripeCustomerId: true,
        createdAt: true,
        vocalQuota: {
          select: {
            plan: true,
            freeSecondsUsed: true,
            freeSecondsLimit: true,
            purchasedSeconds: true,
            monthlySecondsLimit: true,
            stripeSubscriptionId: true,
            stripeCurrentPeriodEnd: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const result = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      stripeCustomerId: u.stripeCustomerId,
      createdAt: u.createdAt,
      plan: u.vocalQuota?.plan ?? null,
      freeSecondsUsed: u.vocalQuota?.freeSecondsUsed ?? 0,
      freeSecondsLimit: u.vocalQuota?.freeSecondsLimit ?? 0,
      purchasedSeconds: u.vocalQuota?.purchasedSeconds ?? 0,
      monthlySecondsLimit: u.vocalQuota?.monthlySecondsLimit ?? 0,
      stripeSubscriptionId: u.vocalQuota?.stripeSubscriptionId ?? null,
      stripeCurrentPeriodEnd: u.vocalQuota?.stripeCurrentPeriodEnd ?? null,
    }))

    return NextResponse.json({ users: result })
  } catch (error) {
    console.error('[admin/payments GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
