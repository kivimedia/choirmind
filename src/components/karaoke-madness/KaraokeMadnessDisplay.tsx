'use client'

import { useMemo, useEffect, useRef } from 'react'
import type { AssignedLine } from '@/lib/karaoke-madness'
import { PLAYER_COLORS } from '@/lib/karaoke-madness'

interface KaraokeMadnessDisplayProps {
  /** Assigned lines with player-colored words. */
  lines: AssignedLine[]
  /** Player names for reference. */
  playerNames: string[]
  /** Current playback time in ms. */
  currentTimeMs: number
  /** Latency offset in ms subtracted from word timestamps. */
  latencyOffsetMs?: number
}

const DEFAULT_LATENCY_OFFSET_MS = 500

export default function KaraokeMadnessDisplay({
  lines,
  playerNames,
  currentTimeMs,
  latencyOffsetMs = DEFAULT_LATENCY_OFFSET_MS,
}: KaraokeMadnessDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Find the currently active word across all lines
  const { activeLineIdx, activeWordIdx } = useMemo(() => {
    let foundLine = -1
    let foundWord = -1
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]
      for (let wi = 0; wi < line.words.length; wi++) {
        const w = line.words[wi]
        const adjustedStart = Math.max(0, w.startMs - latencyOffsetMs)
        const adjustedEnd = Math.max(0, w.endMs - latencyOffsetMs)
        if (currentTimeMs >= adjustedStart && currentTimeMs < adjustedEnd) {
          return { activeLineIdx: li, activeWordIdx: wi }
        }
        // Track the last word we've passed
        if (currentTimeMs >= adjustedStart) {
          foundLine = li
          foundWord = wi
        }
      }
    }
    return { activeLineIdx: foundLine, activeWordIdx: foundWord }
  }, [lines, currentTimeMs, latencyOffsetMs])

  // Current active player for the active word
  const activePlayer = useMemo(() => {
    if (activeLineIdx < 0 || activeWordIdx < 0) return -1
    return lines[activeLineIdx]?.words[activeWordIdx]?.player ?? -1
  }, [lines, activeLineIdx, activeWordIdx])

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeLineIdx < 0 || !containerRef.current) return
    const lineEl = containerRef.current.children[activeLineIdx] as HTMLElement | undefined
    lineEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeLineIdx])

  // Active player's color for the line background highlight
  const activeLineColor = activePlayer >= 0 ? PLAYER_COLORS[activePlayer] : null

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="text-start"
      style={{ fontSize: 'clamp(18px, 5vw, 26px)', lineHeight: 2.0 }}
    >
      {lines.map((line, lineIdx) => {
        const isPast = lineIdx < activeLineIdx
        const isActiveLine = lineIdx === activeLineIdx
        // For upcoming lines (next 2), show a subtle preview
        const isUpcomingLine = !isPast && !isActiveLine &&
          lineIdx <= activeLineIdx + 2 && activeLineIdx >= 0

        return (
          <p
            key={lineIdx}
            className={[
              'mb-2 min-h-[2em] rounded-lg px-2 py-0.5 transition-all duration-500',
              isPast ? 'opacity-30' : '',
              isUpcomingLine ? 'opacity-70' : '',
              !isPast && !isActiveLine && !isUpcomingLine && activeLineIdx >= 0 ? 'opacity-40' : '',
            ].join(' ')}
            style={isActiveLine && activeLineColor ? {
              backgroundColor: `${activeLineColor.hex}08`,
              borderRight: `3px solid ${activeLineColor.hex}40`,
            } : undefined}
          >
            {line.words.length === 0 ? (
              <span>&nbsp;</span>
            ) : (
              line.words.map((word, wordIdx) => {
                const adjustedStart = Math.max(0, word.startMs - latencyOffsetMs)
                const adjustedEnd = Math.max(0, word.endMs - latencyOffsetMs)
                const isCurrentWord = isActiveLine && wordIdx === activeWordIdx
                const isWordPast = currentTimeMs >= adjustedEnd
                const isWordUpcoming = currentTimeMs < adjustedStart &&
                  adjustedStart - currentTimeMs < 3000 // preview 3s ahead
                // Next word indicator (1-2 words ahead on active line)
                const isNextWord = isActiveLine && activeWordIdx >= 0 &&
                  wordIdx > activeWordIdx && wordIdx <= activeWordIdx + 2 &&
                  !isWordPast

                const color = PLAYER_COLORS[word.player] || PLAYER_COLORS[0]

                return (
                  <span
                    key={wordIdx}
                    className={[
                      'inline-block transition-all',
                      isCurrentWord ? 'duration-100' : 'duration-300',
                      isCurrentWord
                        ? `${color.text} font-bold`
                        : isWordPast
                          ? `${color.text} opacity-50`
                          : isNextWord
                            ? `${color.text} opacity-90`
                            : isWordUpcoming
                              ? `${color.text} opacity-70`
                              : `${color.text} opacity-40`,
                    ].join(' ')}
                    style={isCurrentWord ? {
                      textShadow: `0 0 20px ${color.hex}60, 0 0 40px ${color.hex}25`,
                      transform: 'scale(1.12)',
                    } : isNextWord ? {
                      textShadow: `0 0 8px ${color.hex}20`,
                    } : undefined}
                  >
                    {word.word}
                    {wordIdx < line.words.length - 1 ? ' ' : ''}
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
