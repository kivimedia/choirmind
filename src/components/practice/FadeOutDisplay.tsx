'use client'

import { useState, useCallback, useEffect, useMemo, type MouseEvent, type KeyboardEvent } from 'react'
import { tokenizeHebrew } from '@/lib/hebrew-utils'
import {
  applyFadeLevel,
  getFirstLetterHint,
  type FadedWord,
} from '@/lib/fade-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FadeOutDisplayProps {
  /** Full lyrics text — lines separated by newlines. */
  lyrics: string
  /** Current fade level (0-5). */
  fadeLevel: number
  /** Called when a user taps a placeholder to reveal the word. */
  onWordReveal?: (index: number) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Estimate the visual width of a word in `ch` units.
 * Hebrew characters typically render wider than Latin, so we apply a small
 * multiplier. Nikkud marks don't add horizontal width, so we strip them.
 */
function estimateWordWidth(word: string): number {
  // Count only non-combining characters (skip nikkud U+0591-U+05C7)
  let count = 0
  for (const char of word) {
    const code = char.charCodeAt(0)
    if (code < 0x0591 || code > 0x05c7) {
      count++
    }
  }
  // Minimum 2ch, add a small buffer
  return Math.max(2, count)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FadeOutDisplay({
  lyrics,
  fadeLevel,
  onWordReveal,
}: FadeOutDisplayProps) {
  // Track which placeholders the user has tapped to reveal
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(
    new Set(),
  )

  // Parse lyrics into lines of faded words, assigning each word a global index
  const { lines, totalWords } = useMemo(() => {
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

    return { lines: parsed, totalWords: globalIndex }
  }, [lyrics, fadeLevel])

  // Reset revealed words when the fade level or lyrics change
  useEffect(() => {
    setRevealedIndices(new Set())
  }, [fadeLevel, lyrics])

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

  return (
    <div
      dir="rtl"
      className="lyrics-display text-start"
      style={{ fontSize: 'clamp(18px, 5vw, 24px)', lineHeight: 1.8 }}
    >
      {lines.map((lineWords, lineIdx) => (
        <p key={lineIdx} className="mb-2 min-h-[1.8em]">
          {lineWords.length === 0 ? (
            // Empty line — keep some vertical space
            <span>&nbsp;</span>
          ) : (
            lineWords.map(({ faded, globalIdx }, wordIdx) => {
              const isRevealed = revealedIndices.has(globalIdx)
              const shouldShow = faded.visible || isRevealed

              // Determine what to render
              if (shouldShow) {
                // Full word visible
                return (
                  <span
                    key={globalIdx}
                    className="word-fade-out"
                    style={{ opacity: 1 }}
                  >
                    {faded.word}
                    {wordIdx < lineWords.length - 1 ? ' ' : ''}
                  </span>
                )
              }

              if (faded.showFirstLetter && !isRevealed) {
                // Level 4: show only first letter with nikkud
                const hint = getFirstLetterHint(faded.word)
                const widthCh = estimateWordWidth(faded.word)
                return (
                  <span
                    key={globalIdx}
                    role="button"
                    tabIndex={0}
                    className="word-fade-out word-placeholder inline-block cursor-pointer text-text-muted hover:text-primary transition-colors duration-200"
                    style={{ width: `${widthCh}ch` }}
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

              // Hidden word — render placeholder
              const widthCh = estimateWordWidth(faded.word)
              return (
                <span
                  key={globalIdx}
                  role="button"
                  tabIndex={0}
                  className="word-fade-out word-placeholder inline-block cursor-pointer hover:border-primary transition-colors duration-200"
                  style={{ width: `${widthCh}ch` }}
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
      ))}
    </div>
  )
}
