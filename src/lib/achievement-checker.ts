/**
 * Achievement checker — evaluates conditions and unlocks achievements.
 *
 * Called after chunk practice, vocal practice, and streak updates.
 */

import type { PrismaClient } from '@prisma/client'
import type { AchievementKey } from './achievements'

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export type AchievementContext =
  | {
      type: 'chunk_practice'
      songId: string
      chunkCount: number
      perfectCount: number
    }
  | {
      type: 'vocal_practice'
      songId: string
      overallScore: number
      sectionScores: { overallScore: number }[]
      previousOverallScore?: number
    }
  | {
      type: 'streak_update'
      currentStreak: number
    }

/**
 * Check all applicable achievements and unlock any new ones.
 * Returns the keys of newly unlocked achievements (for toast display).
 */
export async function checkAndUnlockAchievements(
  tx: Tx,
  userId: string,
  context: AchievementContext,
): Promise<AchievementKey[]> {
  // Fetch existing achievements to skip duplicates
  const existing = await tx.userAchievement.findMany({
    where: { userId },
    select: { achievement: true },
  })
  const existingKeys = new Set(existing.map((a) => a.achievement))

  const newlyUnlocked: AchievementKey[] = []

  async function tryUnlock(key: AchievementKey) {
    if (existingKeys.has(key)) return
    await tx.userAchievement.create({
      data: { userId, achievement: key },
    })
    newlyUnlocked.push(key)
    existingKeys.add(key) // prevent double-insert within same call
  }

  // --- Common checks (run for all context types) ---

  // first_practice: first chunk practice session
  if (context.type === 'chunk_practice') {
    const sessionCount = await tx.practiceSession.count({ where: { userId } })
    if (sessionCount <= 1) {
      await tryUnlock('first_practice')
    }
  }

  // first_vocal: first vocal practice session
  if (context.type === 'vocal_practice') {
    const vocalCount = await tx.vocalPracticeSession.count({ where: { userId } })
    if (vocalCount <= 1) {
      await tryUnlock('first_vocal')
    }
  }

  // streak-based achievements
  if (context.type === 'streak_update') {
    if (context.currentStreak >= 7) await tryUnlock('streak_7')
    if (context.currentStreak >= 30) await tryUnlock('streak_30')
  }

  // --- Chunk-practice-specific checks ---
  if (context.type === 'chunk_practice') {
    // perfect_song: all chunks of a song at "locked_in" status
    const songChunks = await tx.chunk.count({ where: { songId: context.songId } })
    const lockedChunks = await tx.userChunkProgress.count({
      where: { userId, chunk: { songId: context.songId }, status: 'locked_in' },
    })
    if (songChunks > 0 && lockedChunks >= songChunks) {
      await tryUnlock('perfect_song')
    }

    // songs_5 / songs_10: learned N songs (all chunks at least "solid")
    const allSongIds = await tx.chunk.findMany({
      distinct: ['songId'],
      select: { songId: true },
    })
    let learnedCount = 0
    for (const { songId } of allSongIds) {
      const total = await tx.chunk.count({ where: { songId } })
      const solid = await tx.userChunkProgress.count({
        where: {
          userId,
          chunk: { songId },
          status: { in: ['solid', 'locked_in'] },
        },
      })
      if (total > 0 && solid >= total) learnedCount++
    }
    if (learnedCount >= 5) await tryUnlock('songs_5')
    if (learnedCount >= 10) await tryUnlock('songs_10')

    // chain_master: 10 chunks in a row with nailed_it
    if (context.perfectCount >= 10) {
      await tryUnlock('chain_master')
    }
  }

  // --- Vocal-practice-specific checks ---
  if (context.type === 'vocal_practice') {
    // perfect_section: 95%+ on any section
    if (context.sectionScores.some((s) => s.overallScore >= 95)) {
      await tryUnlock('perfect_section')
    }

    // part_master: 90%+ on ALL sections of the song
    if (
      context.sectionScores.length > 0 &&
      context.sectionScores.every((s) => s.overallScore >= 90)
    ) {
      await tryUnlock('part_master')
    }

    // quick_learner: improved by 20+ points
    if (
      context.previousOverallScore !== undefined &&
      context.overallScore - context.previousOverallScore >= 20
    ) {
      await tryUnlock('quick_learner')
    }

    // choir_ready: 80%+ on all assigned songs
    const assignments = await tx.assignment.findMany({
      where: {
        song: {
          vocalPracticeSessions: { some: { userId } },
        },
      },
      select: { songId: true },
    })
    if (assignments.length > 0) {
      let allPassing = true
      for (const { songId } of assignments) {
        const best = await tx.vocalPracticeSession.findFirst({
          where: { userId, songId },
          orderBy: { overallScore: 'desc' },
          select: { overallScore: true },
        })
        if (!best || best.overallScore < 80) {
          allPassing = false
          break
        }
      }
      if (allPassing) await tryUnlock('choir_ready')
    }
  }

  return newlyUnlocked
}
