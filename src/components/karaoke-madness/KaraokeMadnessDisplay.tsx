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

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeLineIdx < 0 || !containerRef.current) return
    const lineEl = containerRef.current.children[activeLineIdx] as HTMLElement | undefined
    lineEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeLineIdx])

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

        return (
          <p
            key={lineIdx}
            className={[
              'mb-2 min-h-[2em] rounded-lg px-2 transition-all duration-300',
              isActiveLine ? 'bg-white/5' : '',
              isPast ? 'opacity-40' : '',
            ].join(' ')}
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

                const color = PLAYER_COLORS[word.player] || PLAYER_COLORS[0]

                return (
                  <span
                    key={wordIdx}
                    className={[
                      'transition-all duration-150 inline-block',
                      isCurrentWord
                        ? `${color.text} font-bold scale-110`
                        : isWordPast
                          ? `${color.text} opacity-60`
                          : isWordUpcoming
                            ? `${color.text} opacity-80`
                            : `${color.text} opacity-50`,
                    ].join(' ')}
                    style={isCurrentWord ? {
                      textShadow: `0 0 12px ${color.hex}40`,
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
