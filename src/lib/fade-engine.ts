/**
 * Fade Out Engine — the core "progressive word hiding" logic for ChoirMind.
 *
 * Words are progressively hidden across 6 levels (0-5) to test and strengthen
 * a singer's memorisation of lyrics.
 *
 * Level 0: All words visible
 * Level 1: Every 5th word hidden
 * Level 2: Every 3rd word hidden
 * Level 3: Only the first word of each line visible (caller passes lines separately)
 * Level 4: Only the first letter of each word shown (with nikkud)
 * Level 5: Nothing shown — completely blank
 */

import { extractFirstLetter } from './hebrew-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FadedWord {
  /** The original word text. */
  word: string;
  /** Whether the full word is visible at the current fade level. */
  visible: boolean;
  /** If true, only the first letter (with nikkud) should be shown. */
  showFirstLetter: boolean;
}

export type SelfRatingLabel = 'nailed_it' | 'almost' | 'struggling';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_FADE_LEVEL = 0;
export const MAX_FADE_LEVEL = 5;

/** Hebrew labels for each fade level (matching he.json translations). */
const FADE_LEVEL_LABELS: Record<number, string> = {
  0: 'מלא',
  1: 'דעיכה קלה',
  2: 'דעיכה בינונית',
  3: 'דעיכה חזקה',
  4: 'אותיות בלבד',
  5: 'ריק',
};

// ---------------------------------------------------------------------------
// Deterministic pseudo-random number generator (mulberry32)
// ---------------------------------------------------------------------------

/**
 * A simple deterministic PRNG based on mulberry32. Given the same seed, it
 * always produces the same sequence, so the same words fade each render.
 */
function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple hash to turn a string into a numeric seed.
 */
function hashSeed(words: string[]): number {
  let hash = 0;
  const str = words.join('|');
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Core fade logic
// ---------------------------------------------------------------------------

/**
 * Apply a fade level to an array of words, returning visibility metadata for
 * each word.
 *
 * @param words Array of word strings (typically one line of lyrics).
 * @param level Fade level 0-5.
 * @param seed  Optional deterministic seed. If omitted, a seed is derived
 *              from the word content so the same words always fade identically.
 */
export function applyFadeLevel(
  words: string[],
  level: number,
  seed?: number,
): FadedWord[] {
  // Clamp level
  const fadeLvl = Math.max(MIN_FADE_LEVEL, Math.min(MAX_FADE_LEVEL, level));

  if (words.length === 0) return [];

  // Level 0: everything visible
  if (fadeLvl === 0) {
    return words.map((word) => ({
      word,
      visible: true,
      showFirstLetter: false,
    }));
  }

  // Level 5: nothing shown
  if (fadeLvl === 5) {
    return words.map((word) => ({
      word,
      visible: false,
      showFirstLetter: false,
    }));
  }

  // Level 4: only first letter shown (with nikkud)
  if (fadeLvl === 4) {
    return words.map((word) => ({
      word,
      visible: false,
      showFirstLetter: true,
    }));
  }

  // Level 3: only the first word of the line is visible
  if (fadeLvl === 3) {
    return words.map((word, index) => ({
      word,
      visible: index === 0,
      showFirstLetter: false,
    }));
  }

  // Levels 1-2: deterministic pattern-based hiding
  const effectiveSeed = seed ?? hashSeed(words);
  const rng = createSeededRandom(effectiveSeed);

  // Precompute a random order for "which words to hide"
  const indices = words.map((_, i) => i);
  // Fisher-Yates shuffle using the seeded RNG
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Determine how many words to hide
  let hideCount: number;
  if (fadeLvl === 1) {
    // Every 5th word => hide ~20% of words
    hideCount = Math.max(1, Math.floor(words.length / 5));
  } else {
    // Level 2: every 3rd word => hide ~33% of words
    hideCount = Math.max(1, Math.floor(words.length / 3));
  }

  const hiddenSet = new Set(indices.slice(0, hideCount));

  return words.map((word, index) => ({
    word,
    visible: !hiddenSet.has(index),
    showFirstLetter: false,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the Hebrew label for a fade level.
 */
export function getFadeLevelLabel(level: number): string {
  const clamped = Math.max(MIN_FADE_LEVEL, Math.min(MAX_FADE_LEVEL, level));
  return FADE_LEVEL_LABELS[clamped] ?? FADE_LEVEL_LABELS[0];
}

/**
 * Determine the next fade level based on the user's self-rating.
 *
 * - nailed_it  => advance one level (harder)
 * - almost     => stay at the current level
 * - struggling => retreat one level (easier)
 */
export function getNextFadeLevel(
  current: number,
  rating: SelfRatingLabel,
): number {
  switch (rating) {
    case 'nailed_it':
      return Math.min(MAX_FADE_LEVEL, current + 1);
    case 'almost':
      return current;
    case 'struggling':
      return Math.max(MIN_FADE_LEVEL, current - 1);
  }
}

/**
 * Utility: get the first letter (with nikkud) for a word at fade level 4.
 * This is a convenience re-export so consumers don't need to import
 * hebrew-utils directly.
 */
export function getFirstLetterHint(word: string): string {
  return extractFirstLetter(word, true);
}
