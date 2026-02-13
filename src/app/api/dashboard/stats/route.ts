import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/dashboard/stats — single endpoint for all dashboard data
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()

    // Fetch user with memberships
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        xp: true,
        currentStreak: true,
        longestStreak: true,
        lastPracticeDate: true,
        choirMemberships: {
          select: { choirId: true },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const choirIds = user.choirMemberships.map((m) => m.choirId)

    // Determine user state
    let userState: string
    if (choirIds.length === 0) {
      userState = 'no_choir'
    } else {
      // Check if user has any assignments
      const assignmentCount = await prisma.assignment.count({
        where: { choirId: { in: choirIds } },
      })

      if (assignmentCount === 0) {
        userState = 'no_assignments'
      } else {
        // Check if user has ever practiced
        const sessionCount = await prisma.practiceSession.count({
          where: { userId },
        })

        if (sessionCount === 0) {
          userState = 'never_practiced'
        } else {
          // Check due chunks
          const dueCount = await prisma.userChunkProgress.count({
            where: {
              userId,
              nextReviewAt: { lte: now },
            },
          })

          userState = dueCount > 0 ? 'has_due' : 'caught_up'
        }
      }
    }

    // Due chunks count + estimated minutes
    const dueChunks = await prisma.userChunkProgress.findMany({
      where: {
        userId,
        nextReviewAt: { lte: now },
      },
      select: { id: true },
    })
    const dueChunksCount = dueChunks.length
    const estimatedMinutes = Math.ceil(dueChunksCount * 1.5)

    // Songs count
    const songsCount = await prisma.song.count({
      where: {
        archivedAt: null,
        OR: [
          { choirId: { in: choirIds.length > 0 ? choirIds : ['__none__'] } },
          { isPersonal: true, personalUserId: userId },
        ],
      },
    })

    // Chunk stats
    const allProgress = await prisma.userChunkProgress.findMany({
      where: { userId },
      select: { status: true },
    })
    const chunksTotal = allProgress.length
    const chunksMastered = allProgress.filter(
      (p) => p.status === 'solid' || p.status === 'locked_in'
    ).length

    // Weakest chunks (due, lowest memoryStrength, limit 5)
    const weakestChunks = await prisma.userChunkProgress.findMany({
      where: {
        userId,
        nextReviewAt: { lte: now },
      },
      orderBy: { memoryStrength: 'asc' },
      take: 5,
      select: {
        id: true,
        memoryStrength: true,
        status: true,
        chunk: {
          select: {
            id: true,
            label: true,
            song: {
              select: { title: true },
            },
          },
        },
      },
    })

    // Recent achievements + next milestone
    const recentAchievements = await prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
      take: 3,
      select: { achievement: true, unlockedAt: true },
    })

    // Calculate next milestone (streak-based)
    const streakMilestones = [3, 7, 14, 30, 60, 100]
    const currentStreak = user.currentStreak
    const nextStreakTarget = streakMilestones.find((m) => m > currentStreak)
    const nextMilestone = nextStreakTarget
      ? {
          achievement: `streak_${nextStreakTarget}`,
          progress: currentStreak,
          target: nextStreakTarget,
        }
      : null

    // Concert countdowns (songs with targetDate in the future)
    const concertSongs = await prisma.song.findMany({
      where: {
        archivedAt: null,
        targetDate: { gte: now },
        choirId: { in: choirIds.length > 0 ? choirIds : ['__none__'] },
      },
      select: {
        id: true,
        title: true,
        targetDate: true,
        chunks: {
          select: {
            id: true,
            progress: {
              where: { userId },
              select: { status: true },
            },
          },
        },
      },
      orderBy: { targetDate: 'asc' },
    })

    const concertCountdowns = concertSongs.map((song) => {
      const totalChunks = song.chunks.length
      const solidChunks = song.chunks.filter(
        (c) =>
          c.progress.length > 0 &&
          (c.progress[0].status === 'solid' || c.progress[0].status === 'locked_in')
      ).length
      return {
        songId: song.id,
        title: song.title,
        targetDate: song.targetDate,
        readinessPercent: totalChunks > 0 ? Math.round((solidChunks / totalChunks) * 100) : 0,
      }
    })

    // New assignments since last visit (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const newAssignments = await prisma.assignment.findMany({
      where: {
        choirId: { in: choirIds.length > 0 ? choirIds : ['__none__'] },
        assignedAt: { gte: sevenDaysAgo },
      },
      select: {
        song: { select: { title: true } },
        assignedBy: { select: { name: true } },
        assignedAt: true,
      },
      orderBy: { assignedAt: 'desc' },
      take: 5,
    })

    // Weekly activity (last 7 days)
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 6)
    weekStart.setHours(0, 0, 0, 0)

    const recentSessions = await prisma.practiceSession.findMany({
      where: {
        userId,
        startedAt: { gte: weekStart },
      },
      select: { startedAt: true },
    })

    const weekActivity: { date: string; practiced: boolean }[] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(day.getDate() - i)
      const dateStr = day.toISOString().split('T')[0]
      const practiced = recentSessions.some(
        (s) => s.startedAt.toISOString().split('T')[0] === dateStr
      )
      weekActivity.push({ date: dateStr, practiced })
    }

    // Vocal quota (if exists)
    let vocalQuota: { secondsUsed: number; secondsLimit: number } | null = null
    try {
      const quota = await prisma.userVocalQuota.findUnique({
        where: { userId },
        select: { freeSecondsUsed: true, freeSecondsLimit: true },
      })
      if (quota) {
        vocalQuota = {
          secondsUsed: quota.freeSecondsUsed,
          secondsLimit: quota.freeSecondsLimit,
        }
      }
    } catch {
      // Table may not exist yet if migration hasn't run
    }

    // Last vocal score + trend
    let lastVocalScore: {
      songTitle: string
      voicePart: string
      score: number
      previousScore: number | null
      date: string
    } | null = null
    try {
      const recentVocalSessions = await prisma.vocalPracticeSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: {
          overallScore: true,
          voicePart: true,
          createdAt: true,
          song: { select: { title: true } },
        },
      })
      if (recentVocalSessions.length > 0) {
        const latest = recentVocalSessions[0]
        lastVocalScore = {
          songTitle: latest.song.title,
          voicePart: latest.voicePart,
          score: Math.round(latest.overallScore),
          previousScore:
            recentVocalSessions.length > 1
              ? Math.round(recentVocalSessions[1].overallScore)
              : null,
          date: latest.createdAt.toISOString(),
        }
      }
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({
      user: {
        xp: user.xp,
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        lastPracticeDate: user.lastPracticeDate,
      },
      dueChunksCount,
      estimatedMinutes,
      songsCount,
      chunksTotal,
      chunksMastered,
      weakestChunks: weakestChunks.map((w) => ({
        chunkId: w.chunk.id,
        songTitle: w.chunk.song.title,
        chunkLabel: w.chunk.label,
        memoryStrength: w.memoryStrength,
        status: w.status,
      })),
      recentAchievements: recentAchievements.map((a) => ({
        achievement: a.achievement,
        unlockedAt: a.unlockedAt,
      })),
      nextMilestone,
      concertCountdowns,
      newAssignments: newAssignments.map((a) => ({
        songTitle: a.song.title,
        assignedBy: a.assignedBy.name ?? 'Unknown',
        assignedAt: a.assignedAt,
      })),
      weekActivity,
      vocalQuota,
      lastVocalScore,
      userState,
    })
  } catch (error) {
    console.error('GET /api/dashboard/stats error:', error)
    return NextResponse.json(
      { error: 'Failed to load dashboard stats' },
      { status: 500 }
    )
  }
}
