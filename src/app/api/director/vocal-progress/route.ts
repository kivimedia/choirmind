import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/director/vocal-progress?choirId=X
// Director-only: per-member vocal practice stats
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const choirId = request.nextUrl.searchParams.get('choirId')
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

    // Get all choir members
    const members = await prisma.choirMember.findMany({
      where: { choirId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            voicePart: true,
            vocalPracticeSessions: {
              where: {
                createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              },
              select: {
                overallScore: true,
                songId: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    })

    const progress = members.map((m) => {
      const sessions = m.user.vocalPracticeSessions
      const sessionCount = sessions.length
      const avgScore = sessionCount > 0
        ? Math.round(sessions.reduce((s, x) => s + x.overallScore, 0) / sessionCount)
        : 0
      const lastPractice = sessions.length > 0 ? sessions[0].createdAt : null

      // Trend: compare first half vs second half
      const mid = Math.floor(sessions.length / 2)
      const recentHalf = sessions.slice(0, mid)
      const olderHalf = sessions.slice(mid)
      const recentAvg = recentHalf.length > 0 ? recentHalf.reduce((s, x) => s + x.overallScore, 0) / recentHalf.length : 0
      const olderAvg = olderHalf.length > 0 ? olderHalf.reduce((s, x) => s + x.overallScore, 0) / olderHalf.length : 0
      const trend = sessionCount >= 2 ? Math.round(recentAvg - olderAvg) : 0

      // Per-song best scores
      const songBests = new Map<string, number>()
      for (const s of sessions) {
        const current = songBests.get(s.songId) ?? 0
        if (s.overallScore > current) songBests.set(s.songId, s.overallScore)
      }

      return {
        memberId: m.id,
        userId: m.user.id,
        name: m.user.name,
        voicePart: m.user.voicePart,
        sessionCount,
        avgScore,
        trend,
        lastPractice,
        songBests: Object.fromEntries(songBests),
      }
    })

    return NextResponse.json({ progress })
  } catch (error) {
    console.error('[director/vocal-progress GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
