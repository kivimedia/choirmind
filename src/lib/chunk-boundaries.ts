/**
 * Compute time boundaries for each chunk within a song.
 *
 * Used by:
 * - Continuous fading practice (auto-advance lyrics)
 * - Full-song recording (auto-advance lyrics)
 * - Full-song analysis (section scoring)
 */

export interface ChunkBoundary {
  chunkIndex: number
  startMs: number
  endMs: number
}

interface ChunkInput {
  audioStartMs?: number | null
  audioEndMs?: number | null
  lineTimestamps?: number[] | string | null
}

/**
 * Derive start/end millisecond boundaries for each chunk.
 *
 * Priority:
 *   1. Explicit `audioStartMs` / `audioEndMs` on the chunk
 *   2. First/last values from `lineTimestamps`
 *   3. Equal division of `totalDurationMs` across all chunks
 */
export function computeChunkBoundaries(
  chunks: ChunkInput[],
  totalDurationMs: number,
): ChunkBoundary[] {
  if (chunks.length === 0) return []

  const boundaries: ChunkBoundary[] = []

  // First pass: derive raw start/end from available data
  const raw: { start: number | null; end: number | null }[] = chunks.map((c) => {
    // 1. Explicit audioStartMs / audioEndMs
    if (c.audioStartMs != null && c.audioEndMs != null) {
      return { start: c.audioStartMs, end: c.audioEndMs }
    }

    // 2. lineTimestamps — parse if JSON string
    let ts: number[] | null = null
    if (typeof c.lineTimestamps === 'string') {
      try {
        ts = JSON.parse(c.lineTimestamps)
      } catch {
        ts = null
      }
    } else if (Array.isArray(c.lineTimestamps)) {
      ts = c.lineTimestamps
    }

    if (ts && ts.length > 0) {
      const start = c.audioStartMs ?? ts[0]
      const end = c.audioEndMs ?? null // will be filled in second pass
      return { start, end }
    }

    // 3. audioStartMs only
    if (c.audioStartMs != null) {
      return { start: c.audioStartMs, end: null }
    }

    return { start: null, end: null }
  })

  // Check if we have any timing data at all
  const hasAnyTiming = raw.some((r) => r.start !== null)

  if (!hasAnyTiming) {
    // Fallback: equal division
    const chunkDuration = totalDurationMs / chunks.length
    for (let i = 0; i < chunks.length; i++) {
      boundaries.push({
        chunkIndex: i,
        startMs: Math.round(i * chunkDuration),
        endMs: Math.round((i + 1) * chunkDuration),
      })
    }
    return boundaries
  }

  // Second pass: fill gaps using neighboring chunks
  for (let i = 0; i < raw.length; i++) {
    let start = raw[i].start
    let end = raw[i].end

    // Fill missing start: use previous chunk's end, or 0
    if (start === null) {
      start = i > 0 && boundaries[i - 1] ? boundaries[i - 1].endMs : 0
    }

    // Fill missing end: use next chunk's start, or totalDurationMs
    if (end === null) {
      // Look ahead for the next chunk with a start
      let nextStart: number | null = null
      for (let j = i + 1; j < raw.length; j++) {
        if (raw[j].start !== null) {
          nextStart = raw[j].start
          break
        }
      }
      end = nextStart ?? totalDurationMs
    }

    boundaries.push({ chunkIndex: i, startMs: start, endMs: end })
  }

  return boundaries
}

/**
 * Given boundaries and a current playback position, return the active chunk index.
 */
export function getActiveChunkIndex(
  boundaries: ChunkBoundary[],
  currentMs: number,
): number {
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (currentMs >= boundaries[i].startMs) {
      return i
    }
  }
  return 0
}
