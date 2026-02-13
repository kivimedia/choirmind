import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/choir/[choirId]/leaderboard
// Returns members sorted by XP. Supports ?period=week|month|all
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ choirId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { choirId } = await params
    const period = request.nextUrl.searchParams.get('period') || 'all'

    // Check choir exists and leaderboard is enabled
    const choir = await prisma.choir.findUnique({
      where: { id: choirId },
      select: { leaderboardEnabled: true },
    })

    if (!choir) {
      return NextResponse.json({ error: 'Choir not found' }, { status: 404 })
    }

    if (!choir.leaderboardEnabled) {
      return NextResponse.json({ error: 'Leaderboard disabled' }, { status: 403 })
    }

    // Get members with their XP
    const members = await prisma.choirMember.findMany({
      where: { choirId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            voicePart: true,
            xp: true,
            currentStreak: true,
          },
        },
      },
    })

    // For period-based filtering, we'd filter practice sessions within the period
    // For simplicity, use total XP for "all" and session XP for week/month
    let leaderboard

    if (period === 'all') {
      leaderboard = members
        .map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          image: m.user.image,
          voicePart: m.user.voicePart,
          xp: m.user.xp,
          currentStreak: m.user.currentStreak,
        }))
        .sort((a, b) => b.xp - a.xp)
    } else {
      const now = new Date()
      const startDate = new Date()
      if (period === 'week') startDate.setDate(now.getDate() - 7)
      else startDate.setDate(now.getDate() - 30)

      const userIds = members.map((m) => m.userId)

      // Sum XP from practice sessions in the period
      const sessions = await prisma.practiceSession.groupBy({
        by: ['userId'],
        where: {
          userId: { in: userIds },
          startedAt: { gte: startDate },
        },
        _sum: { xpEarned: true },
      })

      // Also sum vocal practice session XP
      const vocalSessions = await prisma.vocalPracticeSession.groupBy({
        by: ['userId'],
        where: {
          userId: { in: userIds },
          createdAt: { gte: startDate },
        },
        _sum: { xpEarned: true },
      })

      const xpMap = new Map<string, number>()
      for (const s of sessions) xpMap.set(s.userId, (xpMap.get(s.userId) ?? 0) + (s._sum.xpEarned ?? 0))
      for (const s of vocalSessions) xpMap.set(s.userId, (xpMap.get(s.userId) ?? 0) + (s._sum.xpEarned ?? 0))

      leaderboard = members
        .map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          image: m.user.image,
          voicePart: m.user.voicePart,
          xp: xpMap.get(m.userId) ?? 0,
          currentStreak: m.user.currentStreak,
        }))
        .sort((a, b) => b.xp - a.xp)
    }

    // Add rank
    const ranked = leaderboard.map((entry, i) => ({
      ...entry,
      rank: i + 1,
    }))

    return NextResponse.json({
      leaderboard: ranked,
      currentUserId: session.user.id,
    })
  } catch (error) {
    console.error('[leaderboard GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
