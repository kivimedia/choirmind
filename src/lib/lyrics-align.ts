/**
 * Lyrics-to-transcript alignment algorithm.
 *
 * Takes ordered song chunks (with lyrics) and Whisper word-level timestamps,
 * then finds the best per-line timestamp for each lyrics line using
 * forward-only fuzzy matching.
 */

interface WhisperWord {
  word: string
  start: number // seconds
  end: number   // seconds
}

interface WhisperSegment {
  text: string
  start: number
  end: number
}

interface ChunkInput {
  id: string
  lyrics: string
  order: number
}

interface WordTimestamp {
  word: string
  startMs: number
  endMs: number
}

interface AlignmentResult {
  chunkId: string
  timestamps: number[] // ms per line
  wordTimestamps: WordTimestamp[][] // per non-empty line, array of word timings
  confidence: number   // 0-1
}

// ---------------------------------------------------------------------------
// Hebrew text normalisation
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .replace(/[\u0591-\u05C7]/g, '')    // strip cantillation + nikkud
    .replace(/[\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4]/g, '') // maqaf, etc.
    .replace(/[^\p{L}\p{N}\s]/gu, '')   // keep all Unicode letters + digits + spaces
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Simple character overlap ratio between two strings (0-1). */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  // Bigram overlap (Dice coefficient)
  const bigrams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2))
    }
    return set
  }
  const setA = bigrams(na)
  const setB = bigrams(nb)
  let intersection = 0
  for (const b of setA) {
    if (setB.has(b)) intersection++
  }
  return (2 * intersection) / (setA.size + setB.size)
}

// ---------------------------------------------------------------------------
// Main alignment
// ---------------------------------------------------------------------------

export function alignLyricsToTranscript(
  chunks: ChunkInput[],
  words: WhisperWord[],
  segments: WhisperSegment[],
): AlignmentResult[] {
  const sorted = [...chunks].sort((a, b) => a.order - b.order)
  const results: AlignmentResult[] = []

  // Build a running text from words so we can do sliding-window matching
  let wordCursor = 0

  for (const chunk of sorted) {
    const lines = chunk.lyrics.split('\n').filter((l) => l.trim())
    const timestamps: number[] = []
    const wordTimestamps: WordTimestamp[][] = []
    let chunkMatches = 0

    for (const line of lines) {
      const normalizedLine = normalize(line)
      if (!normalizedLine) {
        // Empty after normalisation — use previous timestamp or 0
        timestamps.push(timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0)
        wordTimestamps.push([])
        continue
      }

      // Strategy 1: Try to match words forward from cursor
      const ts = matchLineToWords(normalizedLine, words, wordCursor)
      if (ts !== null) {
        timestamps.push(Math.round(ts.startMs))
        wordTimestamps.push(ts.matchedWords)
        wordCursor = ts.nextCursor
        chunkMatches++
        continue
      }

      // Strategy 2: Fall back to segment-level matching
      const segTs = matchLineToSegments(normalizedLine, segments, timestamps)
      if (segTs !== null) {
        timestamps.push(Math.round(segTs))
        wordTimestamps.push([]) // No word-level data from segment fallback
        chunkMatches++
        continue
      }

      // Strategy 3: Interpolate from neighbours
      timestamps.push(timestamps.length > 0 ? timestamps[timestamps.length - 1] + 2000 : 0)
      wordTimestamps.push([])
    }

    const confidence = lines.length > 0 ? chunkMatches / lines.length : 0
    results.push({ chunkId: chunk.id, timestamps, wordTimestamps, confidence })
  }

  return results
}

// ---------------------------------------------------------------------------
// Word-level matching
// ---------------------------------------------------------------------------

function matchLineToWords(
  normalizedLine: string,
  words: WhisperWord[],
  startIdx: number,
): { startMs: number; nextCursor: number; matchedWords: WordTimestamp[] } | null {
  if (words.length === 0) return null

  const lineWords = normalizedLine.split(/\s+/)
  const minWordsToMatch = Math.max(1, Math.floor(lineWords.length * 0.4))

  // Sliding window: try to find a contiguous run of words that matches the line
  let bestScore = 0
  let bestStart = -1
  let bestEnd = -1

  // Search within a reasonable range (don't go too far ahead)
  const searchEnd = Math.min(words.length, startIdx + 200)

  for (let i = startIdx; i < searchEnd; i++) {
    // Build candidate text from words[i..i+windowSize]
    const windowSize = Math.min(lineWords.length + 3, searchEnd - i)
    let candidateText = ''
    for (let j = 0; j < windowSize && i + j < searchEnd; j++) {
      candidateText += (j > 0 ? ' ' : '') + normalize(words[i + j].word)

      // Check similarity after we have enough words
      if (j + 1 >= minWordsToMatch) {
        const score = similarity(normalizedLine, candidateText)
        if (score > bestScore && score > 0.35) {
          bestScore = score
          bestStart = i
          bestEnd = i + j + 1
        }
      }
    }
  }

  if (bestStart >= 0) {
    const matchedWords: WordTimestamp[] = []
    for (let k = bestStart; k < bestEnd; k++) {
      matchedWords.push({
        word: words[k].word,
        startMs: Math.round(words[k].start * 1000),
        endMs: Math.round(words[k].end * 1000),
      })
    }
    return {
      startMs: words[bestStart].start * 1000,
      nextCursor: bestEnd,
      matchedWords,
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Segment-level fallback
// ---------------------------------------------------------------------------

function matchLineToSegments(
  normalizedLine: string,
  segments: WhisperSegment[],
  previousTimestamps: number[],
): number | null {
  const lastTs = previousTimestamps.length > 0
    ? previousTimestamps[previousTimestamps.length - 1]
    : 0

  let bestScore = 0
  let bestTs = -1

  for (const seg of segments) {
    // Only consider segments after the last matched timestamp
    const segMs = seg.start * 1000
    if (segMs < lastTs - 1000) continue

    const normalizedSeg = normalize(seg.text)
    // Check if the line is contained in the segment or vice versa
    if (normalizedSeg.includes(normalizedLine) || normalizedLine.includes(normalizedSeg)) {
      return segMs
    }

    const score = similarity(normalizedLine, normalizedSeg)
    if (score > bestScore && score > 0.3) {
      bestScore = score
      bestTs = segMs
    }
  }

  return bestTs >= 0 ? bestTs : null
}
