import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/practice — get today's review queue
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()

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

    return NextResponse.json({
      reviewQueue,
      count: reviewQueue.length,
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

    // Calculate XP from chunks practiced
    let totalXp = 0
    for (const chunk of chunksPracticed) {
      if (chunk.selfRating === 'nailed_it') totalXp += 10
      else if (chunk.selfRating === 'almost') totalXp += 5
      else totalXp += 2
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

      return { practiceSession, totalXp, newStreak }
    })

    return NextResponse.json(
      {
        session: result.practiceSession,
        xpEarned: result.totalXp,
        currentStreak: result.newStreak,
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
