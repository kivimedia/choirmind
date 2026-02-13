/**
 * Centralized XP calculation for ChoirMind.
 *
 * PRD XP rules:
 * - Base: 5-25 based on score tiers
 * - +5 bonus if score > 70%
 * - +15 bonus if score > 90%
 * - +3 per improved section vs. previous session for same song
 * - 2x multiplier if currentStreak >= 3
 * - +20 if all assigned songs have passing scores
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VocalXpInput {
  overallScore: number
  previousSectionScores?: { overallScore: number }[]
  currentSectionScores?: { overallScore: number }[]
  currentStreak: number
  hasCompletedAllAssignments?: boolean
}

export interface VocalXpResult {
  baseXp: number
  bonusXp: number
  streakMultiplier: number
  totalXp: number
  breakdown: string[]
}

export interface ChunkXpInput {
  selfRating: 'nailed_it' | 'almost' | 'struggling'
  currentStreak: number
}

// ---------------------------------------------------------------------------
// Vocal practice XP
// ---------------------------------------------------------------------------

function getBaseXp(score: number): number {
  if (score >= 90) return 25
  if (score >= 75) return 20
  if (score >= 60) return 15
  if (score >= 40) return 10
  return 5
}

export function calculateVocalXp(input: VocalXpInput): VocalXpResult {
  const {
    overallScore,
    previousSectionScores,
    currentSectionScores,
    currentStreak,
    hasCompletedAllAssignments,
  } = input

  const breakdown: string[] = []

  // Base XP from score tier
  const baseXp = getBaseXp(overallScore)
  breakdown.push(`בסיס: ${baseXp} XP (ציון ${Math.round(overallScore)})`)

  let bonusXp = 0

  // Score > 70% bonus
  if (overallScore > 70) {
    bonusXp += 5
    breakdown.push('+5 XP (ציון מעל 70%)')
  }

  // Score > 90% bonus
  if (overallScore > 90) {
    bonusXp += 15
    breakdown.push('+15 XP (ציון מעל 90%)')
  }

  // Section improvement bonus: +3 per improved section
  if (previousSectionScores && currentSectionScores) {
    const minLen = Math.min(previousSectionScores.length, currentSectionScores.length)
    let improvedCount = 0
    for (let i = 0; i < minLen; i++) {
      if (currentSectionScores[i].overallScore > previousSectionScores[i].overallScore) {
        improvedCount++
      }
    }
    if (improvedCount > 0) {
      const improvementBonus = improvedCount * 3
      bonusXp += improvementBonus
      breakdown.push(`+${improvementBonus} XP (${improvedCount} קטעים משופרים)`)
    }
  }

  // All assignments passing bonus
  if (hasCompletedAllAssignments) {
    bonusXp += 20
    breakdown.push('+20 XP (כל השירים המשובצים עם ציון עובר)')
  }

  // Streak multiplier
  const streakMultiplier = currentStreak >= 3 ? 2 : 1
  if (streakMultiplier > 1) {
    breakdown.push(`x${streakMultiplier} (רצף ${currentStreak} ימים)`)
  }

  const totalXp = (baseXp + bonusXp) * streakMultiplier

  return { baseXp, bonusXp, streakMultiplier, totalXp, breakdown }
}

// ---------------------------------------------------------------------------
// Chunk practice XP
// ---------------------------------------------------------------------------

const CHUNK_XP_MAP: Record<string, number> = {
  nailed_it: 10,
  almost: 5,
  struggling: 2,
}

export function calculateChunkXp(input: ChunkXpInput): number {
  const base = CHUNK_XP_MAP[input.selfRating] ?? 2
  const multiplier = input.currentStreak >= 3 ? 2 : 1
  return base * multiplier
}
