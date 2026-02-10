import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/practice/review — submit a single chunk review
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { chunkId, selfRating, fadeLevel: inputFadeLevel } = body

    if (!chunkId || !selfRating) {
      return NextResponse.json(
        { error: 'chunkId and selfRating are required' },
        { status: 400 }
      )
    }

    const validRatings = ['nailed_it', 'almost', 'struggling']
    if (!validRatings.includes(selfRating)) {
      return NextResponse.json(
        { error: 'selfRating must be one of: nailed_it, almost, struggling' },
        { status: 400 }
      )
    }

    // Verify chunk exists
    const chunk = await prisma.chunk.findUnique({
      where: { id: chunkId },
    })

    if (!chunk) {
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
    }

    // Get existing progress (if any)
    const existingProgress = await prisma.userChunkProgress.findUnique({
      where: {
        userId_chunkId: { userId, chunkId },
      },
    })

    // --- INLINE SPACED REPETITION LOGIC ---

    // Map selfRating to SM-2 numeric rating
    const ratingMap: Record<string, number> = {
      nailed_it: 4,
      almost: 3,
      struggling: 1,
    }
    const rating = ratingMap[selfRating]

    // Previous values (or defaults for new progress)
    const prevEaseFactor = existingProgress?.easeFactor ?? 2.5
    const prevIntervalDays = existingProgress?.intervalDays ?? 1.0
    const prevReviewCount = existingProgress?.reviewCount ?? 0
    const prevFadeLevel = inputFadeLevel ?? existingProgress?.fadeLevel ?? 0

    let newIntervalDays: number
    let newReviewCount: number
    let newEaseFactor: number

    if (rating >= 3) {
      // Successful recall
      if (prevReviewCount === 0) {
        newIntervalDays = 1
      } else if (prevReviewCount === 1) {
        newIntervalDays = 3
      } else {
        newIntervalDays = prevIntervalDays * prevEaseFactor
      }

      // Update ease factor using SM-2 formula
      newEaseFactor = Math.max(
        1.3,
        prevEaseFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02))
      )

      newReviewCount = prevReviewCount + 1
    } else {
      // Failed recall: reset interval, reset review count
      newIntervalDays = 1
      newReviewCount = 0
      newEaseFactor = prevEaseFactor // Keep ease factor on failure
    }

    // Compute next review date
    const now = new Date()
    const nextReviewAt = new Date(now.getTime() + newIntervalDays * 24 * 60 * 60 * 1000)

    // Memory strength: 1.0 right after review (just reviewed)
    const memoryStrength = 1.0

    // Determine status based on memory strength
    // Since we just reviewed, status is based on the strength value
    // But we should also factor in the overall trajectory:
    // Use a composite: for just-reviewed, use the ease factor and review count as signals
    let status: string
    if (memoryStrength < 0.2) {
      status = 'fragile'
    } else if (memoryStrength < 0.4) {
      status = 'shaky'
    } else if (memoryStrength < 0.6) {
      status = 'developing'
    } else if (memoryStrength < 0.8) {
      status = 'solid'
    } else {
      status = 'locked_in'
    }

    // Update fade level based on rating
    let newFadeLevel: number
    if (selfRating === 'nailed_it') {
      newFadeLevel = Math.min(prevFadeLevel + 1, 5)
    } else if (selfRating === 'almost') {
      newFadeLevel = prevFadeLevel
    } else {
      // struggling
      newFadeLevel = Math.max(prevFadeLevel - 1, 0)
    }

    // XP earned for this review
    const xpMap: Record<string, number> = {
      nailed_it: 10,
      almost: 5,
      struggling: 2,
    }
    const xpEarned = xpMap[selfRating]

    // Upsert progress and update user XP in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const progress = await tx.userChunkProgress.upsert({
        where: {
          userId_chunkId: { userId, chunkId },
        },
        create: {
          userId,
          chunkId,
          fadeLevel: newFadeLevel,
          memoryStrength,
          easeFactor: newEaseFactor,
          intervalDays: newIntervalDays,
          nextReviewAt,
          reviewCount: newReviewCount,
          lastReviewedAt: now,
          status,
        },
        update: {
          fadeLevel: newFadeLevel,
          memoryStrength,
          easeFactor: newEaseFactor,
          intervalDays: newIntervalDays,
          nextReviewAt,
          reviewCount: newReviewCount,
          lastReviewedAt: now,
          status,
        },
        include: {
          chunk: {
            include: {
              song: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      })

      // Update user XP
      await tx.user.update({
        where: { id: userId },
        data: {
          xp: { increment: xpEarned },
        },
      })

      return progress
    })

    return NextResponse.json({
      progress: result,
      xpEarned,
      nextReviewAt,
      intervalDays: newIntervalDays,
    })
  } catch (error) {
    console.error('POST /api/practice/review error:', error)
    return NextResponse.json(
      { error: 'Failed to submit review' },
      { status: 500 }
    )
  }
}
