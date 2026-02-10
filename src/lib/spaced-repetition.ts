/**
 * SM-2 Spaced Repetition Algorithm — adapted for choir song chunk memorization.
 *
 * Rating scale (0-5):
 *   0 = total blackout
 *   1 = barely anything recalled
 *   2 = significant struggle
 *   3 = recalled with difficulty
 *   4 = recalled with minor hesitation
 *   5 = perfect recall
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelfRatingLabel = 'nailed_it' | 'almost' | 'struggling';

export type MemoryStatus =
  | 'fragile'
  | 'shaky'
  | 'developing'
  | 'solid'
  | 'locked_in';

export interface ChunkProgress {
  easeFactor: number;
  intervalDays: number;
  reviewCount: number;
}

export interface ReviewResult {
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: Date;
  memoryStrength: number;
  status: MemoryStatus;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_EASE_FACTOR = 1.3;

// ---------------------------------------------------------------------------
// Core SM-2 calculation
// ---------------------------------------------------------------------------

/**
 * Compute the next review schedule based on a 0-5 rating and the current
 * progress state of a chunk.
 */
export function calculateNextReview(
  rating: number,
  currentProgress: ChunkProgress,
): ReviewResult {
  // Clamp rating to valid range
  const q = Math.max(0, Math.min(5, Math.round(rating)));

  let { easeFactor, intervalDays, reviewCount } = currentProgress;

  if (q >= 3) {
    // Successful recall — grow the interval
    reviewCount += 1;

    if (reviewCount === 1) {
      intervalDays = 1;
    } else if (reviewCount === 2) {
      intervalDays = 3;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor * 10) / 10;
    }

    // Update ease factor using standard SM-2 formula
    easeFactor =
      easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

    if (easeFactor < MIN_EASE_FACTOR) {
      easeFactor = MIN_EASE_FACTOR;
    }
  } else {
    // Failed recall — reset
    reviewCount = 0;
    intervalDays = 1;
    // Ease factor stays the same on failure (standard SM-2 behaviour)
  }

  const now = new Date();
  const nextReviewAt = new Date(
    now.getTime() + intervalDays * 24 * 60 * 60 * 1000,
  );

  const memoryStrength = getMemoryStrength(now, intervalDays);
  const status = getStatus(memoryStrength);

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    nextReviewAt,
    memoryStrength,
    status,
  };
}

// ---------------------------------------------------------------------------
// Memory strength
// ---------------------------------------------------------------------------

/**
 * Compute the current memory strength (0-1) based on when the chunk was last
 * reviewed and its current interval.
 *
 * Strength = 1 right after review, decaying linearly toward 0 as time reaches
 * the interval length.
 */
export function getMemoryStrength(
  lastReviewedAt: Date | null,
  intervalDays: number,
): number {
  if (!lastReviewedAt || intervalDays <= 0) {
    return 0;
  }

  const now = new Date();
  const msSinceReview = now.getTime() - lastReviewedAt.getTime();
  const daysSinceReview = msSinceReview / (24 * 60 * 60 * 1000);

  const strength = 1 - daysSinceReview / intervalDays;

  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, strength));
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Map a memory strength (0-1) to a human-readable status label.
 */
export function getStatus(memoryStrength: number): MemoryStatus {
  if (memoryStrength < 0.2) return 'fragile';
  if (memoryStrength < 0.4) return 'shaky';
  if (memoryStrength < 0.6) return 'developing';
  if (memoryStrength < 0.8) return 'solid';
  return 'locked_in';
}

// ---------------------------------------------------------------------------
// Self-rating mapping
// ---------------------------------------------------------------------------

/**
 * Map a user-friendly self-rating label to an SM-2 numeric rating (0-5).
 *
 * - nailed_it  => random 4 or 5 (high confidence)
 * - almost     => 3
 * - struggling => random 1 or 2 (low confidence)
 */
export function mapSelfRating(label: SelfRatingLabel): number {
  switch (label) {
    case 'nailed_it':
      return Math.random() < 0.5 ? 4 : 5;
    case 'almost':
      return 3;
    case 'struggling':
      return Math.random() < 0.5 ? 1 : 2;
  }
}
