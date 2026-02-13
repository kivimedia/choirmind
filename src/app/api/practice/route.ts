import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { calculateChunkXp } from '@/lib/xp'
import { checkAndUnlockAchievements } from '@/lib/achievement-checker'

// GET /api/practice — get today's review queue, or chunk progress for a specific song
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const songId = request.nextUrl.searchParams.get('songId')

    // If songId is provided, return per-chunk progress for that song
    if (songId) {
      const progress = await prisma.userChunkProgress.findMany({
        where: {
          userId,
          chunk: { songId },
        },
        select: {
          chunkId: true,
          fadeLevel: true,
          status: true,
        },
      })
      return NextResponse.json({ progress })
    }

    const now = new Date()
    const filterChoirId = request.nextUrl.searchParams.get('choirId')

    // Find all chunks due for review
    const reviewQueue = await prisma.userChunkProgress.findMany({
      where: {
        userId,
        nextReviewAt: {
          lte: now,
        },
      },
      include: {
        chunk: {
          include: {
            song: {
              select: {
                id: true,
                title: true,
                language: true,
                textDirection: true,
                choirId: true,
                isPersonal: true,
              },
            },
          },
        },
      },
      orderBy: {
        nextReviewAt: 'asc',
      },
    })

    // Filter by choirId if provided
    const filtered = filterChoirId
      ? reviewQueue.filter((item) => {
          const song = item.chunk.song
          return song.choirId === filterChoirId || song.isPersonal
        })
      : reviewQueue

    return NextResponse.json({
      reviewQueue: filtered,
      count: filtered.length,
    })
  } catch (error) {
    console.error('GET /api/practice error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch review queue' },
      { status: 500 }
    )
  }
}

// POST /api/practice — record a practice session
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { mode = 'guided', chunksPracticed, durationSeconds } = body

    if (!chunksPracticed || !Array.isArray(chunksPracticed)) {
      return NextResponse.json(
        { error: 'chunksPracticed array is required' },
        { status: 400 }
      )
    }

    // Fetch user streak for multiplier
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentStreak: true },
    })
    const currentStreak = currentUser?.currentStreak ?? 0

    // Calculate XP from chunks practiced with streak multiplier
    let totalXp = 0
    for (const chunk of chunksPracticed) {
      totalXp += calculateChunkXp({
        selfRating: chunk.selfRating,
        currentStreak,
      })
    }

    // Create practice session and update user stats in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const practiceSession = await tx.practiceSession.create({
        data: {
          userId,
          mode,
          chunksPracticed: JSON.stringify(chunksPracticed),
          durationSeconds: durationSeconds || null,
          xpEarned: totalXp,
          endedAt: new Date(),
        },
      })

      // Update user XP and streak
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { lastPracticeDate: true, currentStreak: true, longestStreak: true },
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      let newStreak = 1
      if (user?.lastPracticeDate) {
        const lastPractice = new Date(user.lastPracticeDate)
        lastPractice.setHours(0, 0, 0, 0)

        const diffDays = Math.floor(
          (today.getTime() - lastPractice.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (diffDays === 0) {
          // Same day, keep current streak
          newStreak = user.currentStreak
        } else if (diffDays === 1) {
          // Consecutive day, increment
          newStreak = user.currentStreak + 1
        }
        // else diffDays > 1: streak resets to 1
      }

      const longestStreak = Math.max(newStreak, user?.longestStreak || 0)

      await tx.user.update({
        where: { id: userId },
        data: {
          xp: { increment: totalXp },
          currentStreak: newStreak,
          longestStreak,
          lastPracticeDate: new Date(),
        },
      })

      // Check streak-based achievements
      const unlockedAchievements = await checkAndUnlockAchievements(tx, userId, {
        type: 'streak_update',
        currentStreak: newStreak,
      })

      return { practiceSession, totalXp, newStreak, unlockedAchievements }
    })

    return NextResponse.json(
      {
        session: result.practiceSession,
        xpEarned: result.totalXp,
        currentStreak: result.newStreak,
        unlockedAchievements: result.unlockedAchievements,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/practice error:', error)
    return NextResponse.json(
      { error: 'Failed to record practice session' },
      { status: 500 }
    )
  }
}
