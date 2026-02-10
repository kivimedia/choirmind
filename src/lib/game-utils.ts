/**
 * Game utility functions for ChoirMind memorization games.
 *
 * Provides shuffling, nikkud stripping, fuzzy matching, and XP calculation
 * helpers used across all game components.
 */

// ---------------------------------------------------------------------------
// Shuffle
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates (Knuth) shuffle — returns a new array with elements in
 * random order. Does NOT mutate the original array.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// ---------------------------------------------------------------------------
// Nikkud stripping
// ---------------------------------------------------------------------------

/**
 * Hebrew nikkud (cantillation marks + vowel points): U+0591 - U+05C7.
 */
const NIKKUD_REGEX = /[\u0591-\u05C7]/g

/**
 * Remove all nikkud (vowel/cantillation) marks from text, leaving consonants
 * and punctuation intact.
 */
export function stripNikkud(text: string): string {
  if (!text) return ''
  return text.replace(NIKKUD_REGEX, '')
}

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

/**
 * Compare two strings after stripping nikkud and normalizing whitespace.
 *
 * Returns an object with:
 * - `match`: true if the strings are identical after normalization
 * - `accuracy`: 0-1 word-level accuracy (ratio of matching words)
 */
export function fuzzyMatch(
  input: string,
  target: string,
): { match: boolean; accuracy: number } {
  const normalize = (s: string) =>
    stripNikkud(s)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,;:!?"""''()[\]{}]/g, '')

  const normalizedInput = normalize(input)
  const normalizedTarget = normalize(target)

  // Exact match after normalization
  if (normalizedInput === normalizedTarget) {
    return { match: true, accuracy: 1 }
  }

  // Word-level accuracy
  const inputWords = normalizedInput.split(' ').filter(Boolean)
  const targetWords = normalizedTarget.split(' ').filter(Boolean)

  if (targetWords.length === 0) {
    return { match: inputWords.length === 0, accuracy: inputWords.length === 0 ? 1 : 0 }
  }

  let correctCount = 0
  for (let i = 0; i < targetWords.length; i++) {
    if (i < inputWords.length && inputWords[i] === targetWords[i]) {
      correctCount++
    }
  }

  const accuracy = correctCount / targetWords.length

  return {
    match: accuracy === 1,
    accuracy,
  }
}

// ---------------------------------------------------------------------------
// XP calculation
// ---------------------------------------------------------------------------

/**
 * Calculate XP earned from a game based on the score achieved.
 *
 * Max 20 XP per game. XP scales linearly with the score-to-max ratio.
 */
export function calculateGameXP(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0

  const ratio = Math.max(0, Math.min(1, score / maxScore))
  return Math.round(ratio * 20)
}

// ---------------------------------------------------------------------------
// Line splitting
// ---------------------------------------------------------------------------

/**
 * Split lyrics text into non-empty lines, trimming whitespace.
 */
export function splitLyricsIntoLines(lyrics: string): string[] {
  return lyrics
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// ---------------------------------------------------------------------------
// Timer formatting
// ---------------------------------------------------------------------------

/**
 * Format seconds into a mm:ss display string.
 */
export function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
