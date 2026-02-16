'use client'

import { useState, useCallback, useEffect, useMemo, useRef, type MouseEvent, type KeyboardEvent } from 'react'
import { tokenizeHebrew } from '@/lib/hebrew-utils'
import {
  applyFadeLevel,
  getFirstLetterHint,
  type FadedWord,
} from '@/lib/fade-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Default offset in ms to compensate for human reaction delay when tapping timestamps. */
const DEFAULT_LATENCY_OFFSET_MS = 500

interface WordTimestamp {
  word: string
  startMs: number
  endMs: number
}

interface KaraokeDisplayProps {
  /** Full lyrics text — lines separated by newlines. */
  lyrics: string
  /** Current fade level (0-5). */
  fadeLevel: number
  /** Array of timestamps in ms, one per non-empty line. */
  timestamps: number[]
  /** Optional word-level timestamps: per non-empty line, array of {word, startMs, endMs}. */
  wordTimestamps?: WordTimestamp[][]
  /** Current playback time in ms from the YouTube player. */
  currentTimeMs: number
  /** Offset in ms subtracted from timestamps to compensate for tap latency (default 500). */
  latencyOffsetMs?: number
  /** Called when a user taps a placeholder to reveal the word. */
  onWordReveal?: (index: number) => void
  /** Called when a user clicks a lyrics line to seek playback there. */
  onLineClick?: (timestampMs: number) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the active line index based on current playback time. */
function getActiveLineIndex(timestamps: number[], currentTimeMs: number): number {
  let active = -1
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] <= currentTimeMs) {
      active = i
    } else {
      break
    }
  }
  return active
}

/** Map from non-empty line index to raw line index (including empty lines). */
function buildNonEmptyLineMap(rawLines: string[]): number[] {
  const map: number[] = []
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].trim()) {
      map.push(i)
    }
  }
  return map
}

function estimateWordWidth(word: string): number {
  let count = 0
  for (const char of word) {
    const code = char.charCodeAt(0)
    if (code < 0x0591 || code > 0x05c7) {
      count++
    }
  }
  return Math.max(2, count)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KaraokeDisplay({
  lyrics,
  fadeLevel,
  timestamps,
  wordTimestamps,
  currentTimeMs,
  latencyOffsetMs = DEFAULT_LATENCY_OFFSET_MS,
  onWordReveal,
  onLineClick,
}: KaraokeDisplayProps) {
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse lyrics into lines of faded words
  const { lines, nonEmptyLineMap } = useMemo(() => {
    const rawLines = lyrics.split('\n')
    let globalIndex = 0
    const parsed: { faded: FadedWord; globalIdx: number }[][] = []

    for (const line of rawLines) {
      const tokens = tokenizeHebrew(line)
      const fadedWords = applyFadeLevel(tokens, fadeLevel)
      const lineItems = fadedWords.map((fw) => ({
        faded: fw,
        globalIdx: globalIndex++,
      }))
      parsed.push(lineItems)
    }

    return {
      lines: parsed,
      nonEmptyLineMap: buildNonEmptyLineMap(rawLines),
    }
  }, [lyrics, fadeLevel])

  // Reset revealed words when fade level or lyrics change
  useEffect(() => {
    setRevealedIndices(new Set())
  }, [fadeLevel, lyrics])

  // Apply latency offset: shift timestamps earlier so highlight appears before the tap point
  const adjustedTimestamps = useMemo(
    () => timestamps.map((t) => Math.max(0, t - latencyOffsetMs)),
    [timestamps, latencyOffsetMs]
  )

  // Active line index (in terms of non-empty lines)
  const activeNonEmptyIdx = getActiveLineIndex(adjustedTimestamps, currentTimeMs)

  // Convert to raw line index for highlighting
  const activeRawLineIdx = activeNonEmptyIdx >= 0 ? nonEmptyLineMap[activeNonEmptyIdx] : -1

  // Adjusted word timestamps (shifted by latency offset like line timestamps)
  const adjustedWordTimestamps = useMemo(
    () => wordTimestamps?.map((lineWords) =>
      lineWords.map((w) => ({
        ...w,
        startMs: Math.max(0, w.startMs - latencyOffsetMs),
        endMs: Math.max(0, w.endMs - latencyOffsetMs),
      }))
    ),
    [wordTimestamps, latencyOffsetMs]
  )

  // Word-by-word progress within the active line
  const wordProgress = useMemo(() => {
    if (activeNonEmptyIdx < 0) return { wordsLit: -1 }

    // If we have real word timestamps for this line, use them
    const lineWordTs = adjustedWordTimestamps?.[activeNonEmptyIdx]
    if (lineWordTs && lineWordTs.length > 0) {
      let wordsLit = 0
      for (const wt of lineWordTs) {
        if (currentTimeMs >= wt.endMs) {
          wordsLit++
        } else {
          break
        }
      }
      // Check if the current word is the one being sung
      const currentWordActive = wordsLit < lineWordTs.length &&
        currentTimeMs >= lineWordTs[wordsLit].startMs
      return { wordsLit, currentWordActive }
    }

    // Fallback: linear interpolation from line timestamps
    const lineStart = adjustedTimestamps[activeNonEmptyIdx]
    const lineEnd = activeNonEmptyIdx + 1 < adjustedTimestamps.length
      ? adjustedTimestamps[activeNonEmptyIdx + 1]
      : lineStart + 5000 // default 5s for last line

    const duration = lineEnd - lineStart
    if (duration <= 0) return { wordsLit: -1 }

    const elapsed = currentTimeMs - lineStart
    const progress = Math.max(0, Math.min(1, elapsed / duration))

    // Count words in the active raw line
    const rawLineIdx = nonEmptyLineMap[activeNonEmptyIdx]
    const wordCount = lines[rawLineIdx]?.length ?? 1

    // How many words are fully "lit" — progress maps linearly across words
    const wordsLit = Math.floor(progress * wordCount)

    return { wordsLit }
  }, [activeNonEmptyIdx, adjustedTimestamps, adjustedWordTimestamps, currentTimeMs, nonEmptyLineMap, lines])

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeRawLineIdx < 0 || !containerRef.current) return
    const lineEl = containerRef.current.children[activeRawLineIdx] as HTMLElement | undefined
    lineEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeRawLineIdx])

  const handleReveal = useCallback(
    (globalIdx: number) => {
      setRevealedIndices((prev) => {
        const next = new Set(prev)
        next.add(globalIdx)
        return next
      })
      onWordReveal?.(globalIdx)
    },
    [onWordReveal],
  )

  // Build a set of raw line indices that are "past" (before active)
  const pastRawLineIndices = useMemo(() => {
    const set = new Set<number>()
    if (activeNonEmptyIdx >= 0) {
      for (let i = 0; i < activeNonEmptyIdx; i++) {
        set.add(nonEmptyLineMap[i])
      }
    }
    return set
  }, [activeNonEmptyIdx, nonEmptyLineMap])

  // Map raw line index → non-empty line index (for click-to-seek)
  const rawToNonEmptyMap = useMemo(() => {
    const map = new Map<number, number>()
    for (let i = 0; i < nonEmptyLineMap.length; i++) {
      map.set(nonEmptyLineMap[i], i)
    }
    return map
  }, [nonEmptyLineMap])

  const handleLineClick = useCallback(
    (rawLineIdx: number) => {
      if (!onLineClick) return
      const nonEmptyIdx = rawToNonEmptyMap.get(rawLineIdx)
      if (nonEmptyIdx !== undefined && nonEmptyIdx < timestamps.length) {
        onLineClick(timestamps[nonEmptyIdx])
      }
    },
    [onLineClick, rawToNonEmptyMap, timestamps],
  )

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="lyrics-display text-start"
      style={{ fontSize: 'clamp(18px, 5vw, 24px)', lineHeight: 1.8 }}
    >
      {lines.map((lineWords, lineIdx) => {
        const isActive = lineIdx === activeRawLineIdx
        const isPast = pastRawLineIndices.has(lineIdx)

        return (
          <p
            key={lineIdx}
            className={[
              'mb-2 min-h-[1.8em] rounded-lg px-2 transition-all duration-300',
              isActive ? 'bg-primary/10' : '',
              isPast ? 'opacity-50' : '',
              onLineClick && lineWords.length > 0 ? 'cursor-pointer hover:bg-primary/5' : '',
            ].join(' ')}
            onClick={() => handleLineClick(lineIdx)}
          >
            {lineWords.length === 0 ? (
              <span>&nbsp;</span>
            ) : (
              lineWords.map(({ faded, globalIdx }, wordIdx) => {
                const isRevealed = revealedIndices.has(globalIdx)
                const shouldShow = faded.visible || isRevealed

                // Word-by-word karaoke coloring for the active line
                const isWordLit = isActive && wordIdx < wordProgress.wordsLit
                const isWordCurrent = isActive && wordIdx === wordProgress.wordsLit

                if (shouldShow) {
                  return (
                    <span
                      key={globalIdx}
                      className={[
                        'word-fade-out transition-colors duration-150',
                        isWordLit ? 'text-primary' : '',
                        isWordCurrent ? 'text-primary font-bold' : '',
                        isPast ? 'text-foreground' : '',
                      ].join(' ')}
                      style={{ opacity: 1 }}
                    >
                      {faded.word}
                      {wordIdx < lineWords.length - 1 ? ' ' : ''}
                    </span>
                  )
                }

                if (faded.showFirstLetter && !isRevealed) {
                  const hint = getFirstLetterHint(faded.word)
                  const widthCh = estimateWordWidth(faded.word)
                  return (
                    <span
                      key={globalIdx}
                      role="button"
                      tabIndex={0}
                      className={[
                        'word-fade-out word-placeholder inline-block cursor-pointer transition-colors duration-200',
                        isWordLit || isWordCurrent
                          ? 'text-primary border-primary'
                          : 'text-text-muted hover:text-primary',
                      ].join(' ')}
                      style={{
                        width: `${widthCh}ch`,
                        borderBottomColor: isWordLit || isWordCurrent ? 'var(--color-primary)' : undefined,
                      }}
                      onClick={(e: MouseEvent) => {
                        e.preventDefault()
                        handleReveal(globalIdx)
                      }}
                      onKeyDown={(e: KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleReveal(globalIdx)
                        }
                      }}
                      aria-label="הצג מילה"
                    >
                      {hint}
                      {wordIdx < lineWords.length - 1 ? ' ' : ''}
                    </span>
                  )
                }

                // Hidden word placeholder
                const widthCh = estimateWordWidth(faded.word)
                return (
                  <span
                    key={globalIdx}
                    role="button"
                    tabIndex={0}
                    className={[
                      'word-fade-out word-placeholder inline-block cursor-pointer transition-colors duration-200',
                      isWordLit || isWordCurrent
                        ? 'border-primary'
                        : 'hover:border-primary',
                    ].join(' ')}
                    style={{
                      width: `${widthCh}ch`,
                      borderBottomColor: isWordLit || isWordCurrent ? 'var(--color-primary)' : undefined,
                    }}
                    onClick={(e: MouseEvent) => {
                      e.preventDefault()
                      handleReveal(globalIdx)
                    }}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleReveal(globalIdx)
                      }
                    }}
                    aria-label="הצג מילה"
                  >
                    &nbsp;
                    {wordIdx < lineWords.length - 1 ? ' ' : ''}
                  </span>
                )
              })
            )}
          </p>
        )
      })}
    </div>
  )
}
