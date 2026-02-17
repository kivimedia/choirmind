'use client'

import { useMemo, useEffect, useRef } from 'react'
import type { AssignedLine } from '@/lib/karaoke-madness'
import { PLAYER_COLORS, EVERYONE } from '@/lib/karaoke-madness'

/** Color used for EVERYONE (-1) — green "all together" style. */
const EVERYONE_COLOR = { bg: 'bg-green-400', text: 'text-green-400', glow: 'shadow-green-400/50', hex: '#4ade80' }

interface KaraokeMadnessDisplayProps {
  lines: AssignedLine[]
  playerNames: string[]
  currentTimeMs: number
  language?: string
  latencyOffsetMs?: number
  onLineClick?: (lineIdx: number) => void
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
  onLineClick,
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
        if (currentTimeMs >= adjustedStart) {
          foundLine = li
          foundWord = wi
        }
      }
    }
    return { activeLineIdx: foundLine, activeWordIdx: foundWord }
  }, [lines, currentTimeMs, latencyOffsetMs])

  // Current active player
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

  const activeLineColor = getColor(activePlayer)

  return (
    <div
      ref={containerRef}
      dir={isRTL ? 'rtl' : 'ltr'}
      className="text-center"
      style={{ fontSize: 'clamp(24px, 7vw, 42px)', lineHeight: 1.8 }}
    >
      {lines.map((line, lineIdx) => {
        const isPast = lineIdx < activeLineIdx
        const isActiveLine = lineIdx === activeLineIdx
        const isUpcomingLine = !isPast && !isActiveLine &&
          lineIdx <= activeLineIdx + 2 && activeLineIdx >= 0

        const linePlayer = line.words.length > 0 ? line.words[0].player : -1
        const isEveryoneLine = linePlayer === EVERYONE
        const lineColor = getColor(linePlayer)
        const linePlayerName = isEveryoneLine
          ? '\u{1F3A4} \u05DB\u05D5\u05DC\u05DD!'
          : linePlayer >= 0
            ? playerNames[linePlayer]
            : ''

        // Active line gets a colored underline glow
        const lineGlowStyle = isActiveLine
          ? {
              background: `linear-gradient(to top, ${activeLineColor.hex}15, transparent 60%)`,
              borderBottom: `2px solid ${activeLineColor.hex}50`,
            }
          : undefined

        return (
          <div
            key={lineIdx}
            onClick={() => line.words.length > 0 && onLineClick?.(lineIdx)}
            className={[
              'py-2 px-3 rounded-lg transition-all duration-500',
              onLineClick && line.words.length > 0 ? 'cursor-pointer hover:bg-white/5' : '',
              isPast ? 'opacity-20' : '',
              isUpcomingLine ? 'opacity-60' : '',
              !isPast && !isActiveLine && !isUpcomingLine && activeLineIdx >= 0 ? 'opacity-30' : '',
              isActiveLine ? 'scale-[1.03]' : '',
            ].join(' ')}
            style={lineGlowStyle}
          >
            {line.words.length === 0 ? (
              <span className="block h-4" />
            ) : (
              <>
                {/* Player name tag above the line */}
                {(linePlayer >= 0 || isEveryoneLine) && isActiveLine && (
                  <div
                    className={`${lineColor.text} font-bold mb-1`}
                    style={{ fontSize: '0.4em', letterSpacing: '0.05em' }}
                  >
                    {linePlayerName}
                  </div>
                )}
                {line.words.map((word, wordIdx) => {
                  const adjustedStart = Math.max(0, word.startMs - latencyOffsetMs)
                  const adjustedEnd = Math.max(0, word.endMs - latencyOffsetMs)
                  const isCurrentWord = isActiveLine && wordIdx === activeWordIdx
                  const isWordPast = currentTimeMs >= adjustedEnd
                  const isWordUpcoming = currentTimeMs < adjustedStart &&
                    adjustedStart - currentTimeMs < 3000
                  const isNextWord = isActiveLine && activeWordIdx >= 0 &&
                    wordIdx > activeWordIdx && wordIdx <= activeWordIdx + 2 &&
                    !isWordPast

                  const color = getColor(word.player)

                  // Inline player-switch indicator
                  const prevPlayer = wordIdx > 0 ? line.words[wordIdx - 1].player : linePlayer
                  const playerChanged = word.player !== prevPlayer && wordIdx > 0
                  const switchColor = getColor(word.player)
                  const isWordEveryone = word.player === EVERYONE
                  const switchName = isWordEveryone
                    ? '\u{1F3A4}'
                    : playerNames[word.player] ?? ''

                  return (
                    <span key={wordIdx}>
                      {playerChanged && (
                        <span
                          className={`${switchColor.text} font-bold opacity-50 align-middle`}
                          style={{ fontSize: '0.35em', marginInline: '0.2em' }}
                        >
                          {switchName}
                        </span>
                      )}
                      <span
                        className={[
                          'transition-all',
                          isCurrentWord ? 'duration-100' : 'duration-300',
                          isCurrentWord
                            ? `${color.text} font-black`
                            : isWordPast
                              ? `${color.text} opacity-40`
                              : isNextWord
                                ? `${color.text} opacity-80`
                                : isWordUpcoming
                                  ? `${color.text} opacity-60`
                                  : `${color.text} opacity-30`,
                        ].join(' ')}
                        style={isCurrentWord ? {
                          textShadow: `0 0 30px ${color.hex}80, 0 0 60px ${color.hex}30`,
                          transform: 'scale(1.08)',
                          display: 'inline-block',
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
