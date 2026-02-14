import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkAndUnlockAchievements } from '@/lib/achievement-checker'

// Spaced repetition logic for a single chunk
function computeChunkUpdate(
  selfRating: string,
  existingProgress: { easeFactor: number; intervalDays: number; reviewCount: number; fadeLevel: number } | null,
  inputFadeLevel: number | undefined,
) {
  const ratingMap: Record<string, number> = {
    nailed_it: 4,
    almost: 3,
    struggling: 1,
  }
  const rating = ratingMap[selfRating]

  const prevEaseFactor = existingProgress?.easeFactor ?? 2.5
  const prevIntervalDays = existingProgress?.intervalDays ?? 1.0
  const prevReviewCount = existingProgress?.reviewCount ?? 0
  const prevFadeLevel = inputFadeLevel ?? existingProgress?.fadeLevel ?? 0

  let newIntervalDays: number
  let newReviewCount: number
  let newEaseFactor: number

  if (rating >= 3) {
    if (prevReviewCount === 0) {
      newIntervalDays = 1
    } else if (prevReviewCount === 1) {
      newIntervalDays = 3
    } else {
      newIntervalDays = prevIntervalDays * prevEaseFactor
    }
    newEaseFactor = Math.max(
      1.3,
      prevEaseFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02))
    )
    newReviewCount = prevReviewCount + 1
  } else {
    newIntervalDays = 1
    newReviewCount = 0
    newEaseFactor = prevEaseFactor
  }

  const now = new Date()
  const nextReviewAt = new Date(now.getTime() + newIntervalDays * 24 * 60 * 60 * 1000)
  const memoryStrength = 1.0

  let status: string
  if (memoryStrength < 0.2) status = 'fragile'
  else if (memoryStrength < 0.4) status = 'shaky'
  else if (memoryStrength < 0.6) status = 'developing'
  else if (memoryStrength < 0.8) status = 'solid'
  else status = 'locked_in'

  let newFadeLevel: number
  if (selfRating === 'nailed_it') {
    newFadeLevel = Math.min(prevFadeLevel + 1, 5)
  } else if (selfRating === 'almost') {
    newFadeLevel = prevFadeLevel
  } else {
    newFadeLevel = Math.max(prevFadeLevel - 1, 0)
  }

  return {
    fadeLevel: newFadeLevel,
    memoryStrength,
    easeFactor: newEaseFactor,
    intervalDays: newIntervalDays,
    nextReviewAt,
    reviewCount: newReviewCount,
    lastReviewedAt: now,
    status,
  }
}

// POST /api/practice/review — submit chunk review(s)
// Accepts either { chunkId, selfRating } for single chunk
// or { chunkIds, selfRating, fadeLevel } for bulk (continuous practice)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { selfRating, fadeLevel: inputFadeLevel } = body

    // Support both single and bulk
    const chunkIds: string[] = body.chunkIds ?? (body.chunkId ? [body.chunkId] : [])

    if (chunkIds.length === 0 || !selfRating) {
      return NextResponse.json(
        { error: 'chunkId (or chunkIds) and selfRating are required' },
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

    // Verify chunks exist
    const chunks = await prisma.chunk.findMany({
      where: { id: { in: chunkIds } },
      include: { song: { select: { id: true, title: true } } },
    })

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No chunks found' }, { status: 404 })
    }

    // Get existing progress for all chunks
    const existingProgressList = await prisma.userChunkProgress.findMany({
      where: {
        userId,
        chunkId: { in: chunkIds },
      },
    })
    const progressMap = new Map(existingProgressList.map((p) => [p.chunkId, p]))

    const xpMap: Record<string, number> = {
      nailed_it: 10,
      almost: 5,
      struggling: 2,
    }
    // For bulk: award XP once for the whole song, not per chunk
    const xpEarned = chunkIds.length > 1
      ? xpMap[selfRating] * 2 // bonus for full song practice
      : xpMap[selfRating]

    const result = await prisma.$transaction(async (tx) => {
      const updatedProgress = []
      for (const cid of chunkIds) {
        const existing = progressMap.get(cid)
        const update = computeChunkUpdate(selfRating, existing ? {
          easeFactor: existing.easeFactor,
          intervalDays: existing.intervalDays,
          reviewCount: existing.reviewCount,
          fadeLevel: existing.fadeLevel,
        } : null, inputFadeLevel)

        const progress = await tx.userChunkProgress.upsert({
          where: { userId_chunkId: { userId, chunkId: cid } },
          create: { userId, chunkId: cid, ...update },
          update,
        })
        updatedProgress.push(progress)
      }

      // Update user XP
      await tx.user.update({
        where: { id: userId },
        data: { xp: { increment: xpEarned } },
      })

      // Check achievements (use first chunk's song)
      const songId = chunks[0].song.id
      const unlockedAchievements = await checkAndUnlockAchievements(tx, userId, {
        type: 'chunk_practice',
        songId,
        chunkCount: chunkIds.length,
        perfectCount: selfRating === 'nailed_it' ? chunkIds.length : 0,
      })

      return { progress: updatedProgress, unlockedAchievements }
    })

    const firstUpdate = computeChunkUpdate(selfRating, null, inputFadeLevel)

    return NextResponse.json({
      progress: chunkIds.length === 1 ? result.progress[0] : result.progress,
      xpEarned,
      nextReviewAt: firstUpdate.nextReviewAt,
      intervalDays: firstUpdate.intervalDays,
      unlockedAchievements: result.unlockedAchievements,
    })
  } catch (error) {
    console.error('POST /api/practice/review error:', error)
    return NextResponse.json(
      { error: 'Failed to submit review' },
      { status: 500 }
    )
  }
}
