/**
 * Karaoke Madness — multiplayer song assignment algorithm.
 *
 * Assigns lyrics segments to 2-4 players at three difficulty levels:
 *   Level 1: Line by Line
 *   Level 2: Phrase Chunks (2-3 word phrases)
 *   Level 3: Word by Word
 */

export interface WordTimestamp {
  word: string
  startMs: number
  endMs: number
}

export interface AssignedWord {
  word: string
  startMs: number
  endMs: number
  player: number // 0-indexed player number
}

export interface AssignedLine {
  words: AssignedWord[]
  lineIndex: number // index into the non-empty lines array
}

export interface PlayerAssignment {
  lines: AssignedLine[]
  playerCount: number
  difficulty: 1 | 2 | 3
}

// Seeded PRNG (mulberry32)
function createPRNG(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Check if a word contains a Hebrew maqaf (U+05BE) that joins it to the next word.
 * Maqaf-joined words should stay together.
 */
function hasMaqaf(word: string): boolean {
  return word.includes('\u05BE') || word.endsWith('-')
}

/**
 * Group words into maqaf-joined pairs where applicable.
 */
function groupMaqafWords(words: WordTimestamp[]): WordTimestamp[][] {
  const groups: WordTimestamp[][] = []
  let i = 0
  while (i < words.length) {
    if (hasMaqaf(words[i].word) && i + 1 < words.length) {
      groups.push([words[i], words[i + 1]])
      i += 2
    } else {
      groups.push([words[i]])
      i++
    }
  }
  return groups
}

/**
 * Calculate total singing duration for each player.
 */
function playerDurations(assigned: AssignedWord[], playerCount: number): number[] {
  const durations = new Array(playerCount).fill(0)
  for (const w of assigned) {
    durations[w.player] += w.endMs - w.startMs
  }
  return durations
}

/**
 * Pick the player with least total singing time, with random tiebreaking.
 * Avoids giving more than maxConsecutive segments to the same player.
 */
function pickBalancedPlayer(
  durations: number[],
  lastPlayer: number,
  consecutiveCount: number,
  maxConsecutive: number,
  rand: () => number,
): number {
  const minDuration = Math.min(...durations)
  // Candidates: players with duration within 20% of minimum (fuzzy balancing)
  const threshold = minDuration + (minDuration * 0.2) + 500
  let candidates = durations
    .map((d, i) => ({ i, d }))
    .filter(({ d }) => d <= threshold)
    .map(({ i }) => i)

  // Enforce max consecutive constraint
  if (consecutiveCount >= maxConsecutive && candidates.length > 1) {
    candidates = candidates.filter((p) => p !== lastPlayer)
  }

  if (candidates.length === 0) {
    candidates = durations.map((_, i) => i).filter((p) => p !== lastPlayer)
    if (candidates.length === 0) candidates = durations.map((_, i) => i)
  }

  return candidates[Math.floor(rand() * candidates.length)]
}

/**
 * Level 1: Assign entire lines to random players.
 * Max 2 consecutive lines to the same player.
 */
function assignLevel1(
  wordTimestamps: WordTimestamp[][],
  playerCount: number,
  rand: () => number,
): AssignedLine[] {
  const result: AssignedLine[] = []
  const durations = new Array(playerCount).fill(0)
  let lastPlayer = -1
  let consecutive = 0

  for (let lineIdx = 0; lineIdx < wordTimestamps.length; lineIdx++) {
    const lineWords = wordTimestamps[lineIdx]
    if (lineWords.length === 0) {
      result.push({ words: [], lineIndex: lineIdx })
      continue
    }

    const player = pickBalancedPlayer(durations, lastPlayer, consecutive, 2, rand)
    consecutive = player === lastPlayer ? consecutive + 1 : 1
    lastPlayer = player

    const assignedWords: AssignedWord[] = lineWords.map((w) => ({
      ...w,
      player,
    }))

    for (const w of assignedWords) {
      durations[player] += w.endMs - w.startMs
    }

    result.push({ words: assignedWords, lineIndex: lineIdx })
  }

  return result
}

/**
 * Level 2: Split lines into 2-3 word phrases, assign each phrase.
 * Don't split maqaf-joined words.
 */
function assignLevel2(
  wordTimestamps: WordTimestamp[][],
  playerCount: number,
  rand: () => number,
): AssignedLine[] {
  const result: AssignedLine[] = []
  const durations = new Array(playerCount).fill(0)
  let lastPlayer = -1
  let consecutive = 0

  for (let lineIdx = 0; lineIdx < wordTimestamps.length; lineIdx++) {
    const lineWords = wordTimestamps[lineIdx]
    if (lineWords.length === 0) {
      result.push({ words: [], lineIndex: lineIdx })
      continue
    }

    // Group words into maqaf-aware groups
    const groups = groupMaqafWords(lineWords)

    // Split groups into phrases of 2-3 groups each
    const phrases: WordTimestamp[][] = []
    let phraseSize = groups.length <= 3 ? groups.length : 2 + (rand() < 0.5 ? 1 : 0)
    let gi = 0
    while (gi < groups.length) {
      const remaining = groups.length - gi
      if (remaining <= phraseSize + 1) phraseSize = remaining
      const phrase: WordTimestamp[] = []
      for (let j = 0; j < phraseSize && gi < groups.length; j++, gi++) {
        phrase.push(...groups[gi])
      }
      phrases.push(phrase)
      phraseSize = 2 + (rand() < 0.5 ? 1 : 0)
    }

    const assignedWords: AssignedWord[] = []
    for (const phrase of phrases) {
      const player = pickBalancedPlayer(durations, lastPlayer, consecutive, 2, rand)
      consecutive = player === lastPlayer ? consecutive + 1 : 1
      lastPlayer = player

      for (const w of phrase) {
        assignedWords.push({ ...w, player })
        durations[player] += w.endMs - w.startMs
      }
    }

    result.push({ words: assignedWords, lineIndex: lineIdx })
  }

  return result
}

/**
 * Level 3: Assign each word (or maqaf pair) to a random player.
 * Maximum switching for chaos.
 */
function assignLevel3(
  wordTimestamps: WordTimestamp[][],
  playerCount: number,
  rand: () => number,
): AssignedLine[] {
  const result: AssignedLine[] = []
  const durations = new Array(playerCount).fill(0)
  let lastPlayer = -1

  for (let lineIdx = 0; lineIdx < wordTimestamps.length; lineIdx++) {
    const lineWords = wordTimestamps[lineIdx]
    if (lineWords.length === 0) {
      result.push({ words: [], lineIndex: lineIdx })
      continue
    }

    const groups = groupMaqafWords(lineWords)
    const assignedWords: AssignedWord[] = []

    for (const group of groups) {
      // In level 3, we force switching — never same player twice unless only 1 player
      const player = pickBalancedPlayer(durations, lastPlayer, 1, 1, rand)
      lastPlayer = player

      for (const w of group) {
        assignedWords.push({ ...w, player })
        durations[player] += w.endMs - w.startMs
      }
    }

    result.push({ words: assignedWords, lineIndex: lineIdx })
  }

  return result
}

/**
 * Main entry point: generate player assignments for Karaoke Madness.
 */
export function generateAssignments(
  wordTimestamps: WordTimestamp[][],
  playerCount: 2 | 3 | 4,
  difficulty: 1 | 2 | 3,
  seed: number = Date.now(),
): PlayerAssignment {
  const rand = createPRNG(seed)

  let lines: AssignedLine[]
  switch (difficulty) {
    case 1:
      lines = assignLevel1(wordTimestamps, playerCount, rand)
      break
    case 2:
      lines = assignLevel2(wordTimestamps, playerCount, rand)
      break
    case 3:
      lines = assignLevel3(wordTimestamps, playerCount, rand)
      break
  }

  return { lines, playerCount, difficulty }
}

/**
 * Player colors used for display.
 */
export const PLAYER_COLORS = [
  { bg: 'bg-blue-500', text: 'text-blue-500', glow: 'shadow-blue-500/50', hex: '#3b82f6' },
  { bg: 'bg-rose-500', text: 'text-rose-500', glow: 'shadow-rose-500/50', hex: '#f43f5e' },
  { bg: 'bg-emerald-500', text: 'text-emerald-500', glow: 'shadow-emerald-500/50', hex: '#10b981' },
  { bg: 'bg-amber-500', text: 'text-amber-500', glow: 'shadow-amber-500/50', hex: '#f59e0b' },
] as const

/**
 * Compute fun stats for the end screen.
 */
export function computeGameStats(
  assignment: PlayerAssignment,
  playerNames: string[],
): {
  wordCounts: number[]
  totalDurationMs: number[]
  mostWords: { name: string; count: number }
  longestStretch: { name: string; durationMs: number }
} {
  const { lines, playerCount } = assignment
  const wordCounts = new Array(playerCount).fill(0)
  const totalDurationMs = new Array(playerCount).fill(0)

  // Track longest consecutive stretch per player
  const longestStretchMs = new Array(playerCount).fill(0)
  let currentPlayer = -1
  let currentStretchStart = 0
  let currentStretchEnd = 0

  for (const line of lines) {
    for (const word of line.words) {
      wordCounts[word.player]++
      totalDurationMs[word.player] += word.endMs - word.startMs

      if (word.player === currentPlayer) {
        currentStretchEnd = word.endMs
      } else {
        if (currentPlayer >= 0) {
          const stretch = currentStretchEnd - currentStretchStart
          if (stretch > longestStretchMs[currentPlayer]) {
            longestStretchMs[currentPlayer] = stretch
          }
        }
        currentPlayer = word.player
        currentStretchStart = word.startMs
        currentStretchEnd = word.endMs
      }
    }
  }
  // Final stretch
  if (currentPlayer >= 0) {
    const stretch = currentStretchEnd - currentStretchStart
    if (stretch > longestStretchMs[currentPlayer]) {
      longestStretchMs[currentPlayer] = stretch
    }
  }

  const maxWords = Math.max(...wordCounts)
  const mostWordsPlayer = wordCounts.indexOf(maxWords)

  const maxStretch = Math.max(...longestStretchMs)
  const longestStretchPlayer = longestStretchMs.indexOf(maxStretch)

  return {
    wordCounts,
    totalDurationMs,
    mostWords: { name: playerNames[mostWordsPlayer] || `שחקן ${mostWordsPlayer + 1}`, count: maxWords },
    longestStretch: { name: playerNames[longestStretchPlayer] || `שחקן ${longestStretchPlayer + 1}`, durationMs: maxStretch },
  }
}
