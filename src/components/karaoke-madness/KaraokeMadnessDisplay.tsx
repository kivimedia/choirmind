'use client'

import { useMemo, useEffect, useRef } from 'react'
import type { AssignedLine } from '@/lib/karaoke-madness'
import { PLAYER_COLORS, EVERYONE } from '@/lib/karaoke-madness'

/** Color used for EVERYONE (-1) lines — a white/gold "all together" style. */
const EVERYONE_COLOR = { bg: 'bg-white', text: 'text-yellow-300', glow: '', hex: '#fbbf24' }

interface KaraokeMadnessDisplayProps {
  /** Assigned lines with player-colored words. */
  lines: AssignedLine[]
  /** Player names for reference. */
  playerNames: string[]
  /** Current playback time in ms. */
  currentTimeMs: number
  /** Song language — determines text direction. */
  language?: string
  /** Latency offset in ms subtracted from word timestamps. */
  latencyOffsetMs?: number
}

const DEFAULT_LATENCY_OFFSET_MS = 500

function getColor(player: number) {
  if (player === EVERYONE) return EVERYONE_COLOR
  return PLAYER_COLORS[player] || PLAYER_COLORS[0]
}

export default function KaraokeMadnessDisplay({
  lines,
  playerNames,
  currentTimeMs,
  language = 'he',
  latencyOffsetMs = DEFAULT_LATENCY_OFFSET_MS,
}: KaraokeMadnessDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isRTL = language === 'he'

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
  const activeLineColor = getColor(activePlayer)

  return (
    <div
      ref={containerRef}
      dir={isRTL ? 'rtl' : 'ltr'}
      className={isRTL ? 'text-right' : 'text-left'}
      style={{ fontSize: 'clamp(18px, 5vw, 26px)', lineHeight: 2.0 }}
    >
      {lines.map((line, lineIdx) => {
        const isPast = lineIdx < activeLineIdx
        const isActiveLine = lineIdx === activeLineIdx
        // For upcoming lines (next 2), show a subtle preview
        const isUpcomingLine = !isPast && !isActiveLine &&
          lineIdx <= activeLineIdx + 2 && activeLineIdx >= 0

        // Determine the dominant player for this line (for the label)
        const linePlayer = line.words.length > 0 ? line.words[0].player : -1
        const isEveryoneLine = linePlayer === EVERYONE
        const lineColor = getColor(linePlayer)
        const linePlayerName = isEveryoneLine
          ? '\u{1F3A4} כולם!'
          : linePlayer >= 0
            ? playerNames[linePlayer]
            : ''

        // Border side depends on text direction
        const borderStyle = isActiveLine && activePlayer !== -1
          ? {
              backgroundColor: `${activeLineColor.hex}08`,
              [isRTL ? 'borderRight' : 'borderLeft']: `3px solid ${activeLineColor.hex}40`,
            }
          : isActiveLine && isEveryoneLine
            ? {
                backgroundColor: `${EVERYONE_COLOR.hex}10`,
                [isRTL ? 'borderRight' : 'borderLeft']: `3px solid ${EVERYONE_COLOR.hex}50`,
              }
            : undefined

        return (
          <div
            key={lineIdx}
            className={[
              'mb-2 min-h-[2em] rounded-lg px-2 py-0.5 transition-all duration-500',
              isPast ? 'opacity-30' : '',
              isUpcomingLine ? 'opacity-70' : '',
              !isPast && !isActiveLine && !isUpcomingLine && activeLineIdx >= 0 ? 'opacity-40' : '',
            ].join(' ')}
            style={borderStyle}
          >
            {line.words.length === 0 ? (
              <span>&nbsp;</span>
            ) : (
              <>
                {/* Player name label at start of line */}
                {(linePlayer >= 0 || isEveryoneLine) && (
                  <span
                    className={`${lineColor.text} text-xs font-bold opacity-60 align-middle`}
                    style={{ fontSize: '0.55em', marginInlineEnd: '0.5em' }}
                  >
                    {linePlayerName}
                  </span>
                )}
                {line.words.map((word, wordIdx) => {
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

                  const isWordEveryone = word.player === EVERYONE
                  const color = getColor(word.player)

                  // Show inline player-switch indicator when player changes mid-line
                  const prevPlayer = wordIdx > 0 ? line.words[wordIdx - 1].player : linePlayer
                  const playerChanged = word.player !== prevPlayer && wordIdx > 0
                  const switchColor = getColor(word.player)
                  const switchName = isWordEveryone
                    ? '\u{1F3A4}'
                    : playerNames[word.player] ?? ''

                  return (
                    <span key={wordIdx}>
                      {playerChanged && (
                        <span
                          className={`${switchColor.text} text-xs font-bold opacity-60 align-middle`}
                          style={{ fontSize: '0.5em', marginInline: '0.3em' }}
                        >
                          {switchName}
                        </span>
                      )}
                      <span
                        className={[
                          'transition-all',
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
                          display: 'inline',
                        } : undefined}
                      >
                        {word.word}
                      </span>
                      {wordIdx < line.words.length - 1 ? ' ' : ''}
                    </span>
                  )
                })}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
