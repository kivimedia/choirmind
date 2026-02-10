'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import { tokenizeHebrew } from '@/lib/hebrew-utils'
import {
  stripNikkud,
  splitLyricsIntoLines,
  formatTimer,
} from '@/lib/game-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FillTheBlankProps {
  lyrics: string
  chunkLabel: string
  difficulty: 'easy' | 'medium' | 'hard'
  onComplete: (score: number) => void
}

interface LineState {
  tokens: string[]
  blankIndex: number
  blankWord: string
}

// ---------------------------------------------------------------------------
// Blank selection logic
// ---------------------------------------------------------------------------

/**
 * Pick which word index to blank out based on difficulty.
 *
 * - easy: prefer short/common words (< 3 chars)
 * - medium: prefer content words (> 3 chars)
 * - hard: first word of each line
 */
function pickBlankIndex(
  tokens: string[],
  difficulty: 'easy' | 'medium' | 'hard',
): number {
  if (tokens.length === 0) return 0

  if (difficulty === 'hard') {
    return 0
  }

  if (difficulty === 'easy') {
    // Find short words (< 3 chars stripped of nikkud)
    const candidates = tokens
      .map((t, i) => ({ i, len: stripNikkud(t).length }))
      .filter((c) => c.len > 0 && c.len < 3)

    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)].i
    }
    // Fallback: random word
    return Math.floor(Math.random() * tokens.length)
  }

  // medium: prefer content words (> 3 chars)
  const candidates = tokens
    .map((t, i) => ({ i, len: stripNikkud(t).length }))
    .filter((c) => c.len > 3)

  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)].i
  }

  return Math.floor(Math.random() * tokens.length)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FillTheBlank({
  lyrics,
  chunkLabel,
  difficulty,
  onComplete,
}: FillTheBlankProps) {
  const rawLines = splitLyricsIntoLines(lyrics)

  // Build line states once
  const buildLineStates = useCallback((): LineState[] => {
    return rawLines.map((line) => {
      const tokens = tokenizeHebrew(line)
      const blankIndex = pickBlankIndex(tokens, difficulty)
      return {
        tokens,
        blankIndex,
        blankWord: tokens[blankIndex] ?? '',
      }
    })
  }, [rawLines, difficulty])

  const [lineStates] = useState<LineState[]>(buildLineStates)
  const [currentLineIdx, setCurrentLineIdx] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'revealed' | null>(null)
  const [score, setScore] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [gameOver, setGameOver] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Start timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Focus input on line change
  useEffect(() => {
    if (!gameOver) {
      inputRef.current?.focus()
    }
  }, [currentLineIdx, gameOver])

  // -----------------------------------------------------------------------
  // Submission
  // -----------------------------------------------------------------------

  const checkInput = () => {
    const current = lineStates[currentLineIdx]
    if (!current) return

    const normalizedInput = stripNikkud(inputValue.trim())
    const normalizedTarget = stripNikkud(current.blankWord.trim())

    if (normalizedInput === normalizedTarget) {
      setFeedback('correct')
      const points = attempt === 0 ? 10 : 5
      setScore((prev) => prev + points)

      // Auto-advance after brief pause
      setTimeout(() => advanceLine(), 1200)
    } else {
      const newAttempt = attempt + 1
      setAttempt(newAttempt)

      if (newAttempt >= 2) {
        // Reveal the answer
        setFeedback('revealed')
        setTimeout(() => advanceLine(), 2000)
      } else {
        setFeedback('wrong')
        // Clear feedback after a moment
        setTimeout(() => setFeedback(null), 1000)
      }
    }
  }

  const advanceLine = () => {
    const nextIdx = currentLineIdx + 1
    if (nextIdx >= lineStates.length) {
      setGameOver(true)
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    setCurrentLineIdx(nextIdx)
    setInputValue('')
    setAttempt(0)
    setFeedback(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !feedback) {
      checkInput()
    }
  }

  // -----------------------------------------------------------------------
  // Game over screen
  // -----------------------------------------------------------------------

  if (gameOver) {
    const maxScore = lineStates.length * 10
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="text-5xl" aria-hidden="true">
          &#9997;&#65039;
        </div>
        <h2 className="text-2xl font-bold text-foreground">סיימתם!</h2>
        <p className="text-text-muted">{chunkLabel}</p>
        <div className="rounded-xl bg-primary/10 px-8 py-4">
          <span className="text-4xl font-bold text-primary">{score}</span>
          <span className="ms-2 text-lg text-text-muted">/ {maxScore}</span>
        </div>
        <p className="text-sm text-text-muted">
          זמן: {formatTimer(elapsedSeconds)}
        </p>
        <Button variant="primary" size="lg" onClick={() => onComplete(score)}>
          סיום
        </Button>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render current line
  // -----------------------------------------------------------------------

  const current = lineStates[currentLineIdx]
  if (!current) return null

  const difficultyLabels: Record<string, string> = {
    easy: 'קל',
    medium: 'בינוני',
    hard: 'קשה',
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            מילה חסרה
          </h3>
          <p className="text-sm text-text-muted">
            {chunkLabel} &middot; {difficultyLabels[difficulty]}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary tabular-nums">
            {formatTimer(elapsedSeconds)}
          </span>
          <span className="text-sm text-text-muted">
            {currentLineIdx + 1} / {lineStates.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{
            width: `${((currentLineIdx) / lineStates.length) * 100}%`,
          }}
        />
      </div>

      {/* Score */}
      <div className="text-center">
        <span className="text-sm text-text-muted">ניקוד: </span>
        <span className="font-bold text-primary">{score}</span>
      </div>

      {/* Line with blank */}
      <div
        className="rounded-xl border border-border bg-surface p-4"
        dir="rtl"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg leading-relaxed">
          {current.tokens.map((token, idx) => {
            if (idx === current.blankIndex) {
              // The blank slot
              if (feedback === 'correct') {
                return (
                  <span
                    key={idx}
                    className="inline-block rounded-lg bg-status-solid/15 px-2 py-0.5 font-bold text-status-solid"
                  >
                    {current.blankWord}
                  </span>
                )
              }
              if (feedback === 'revealed') {
                return (
                  <span
                    key={idx}
                    className="inline-block rounded-lg bg-status-shaky/15 px-2 py-0.5 font-bold text-status-shaky"
                  >
                    {current.blankWord}
                  </span>
                )
              }
              return (
                <span key={idx} className="inline-flex items-center">
                  <input
                    ref={inputRef}
                    type="text"
                    dir="auto"
                    placeholder="?"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={[
                      'inline-block w-28 rounded-lg border-2 bg-background px-2 py-0.5 text-center text-lg font-medium',
                      'transition-colors duration-150',
                      'focus:outline-none focus:ring-2 focus:ring-primary/30',
                      feedback === 'wrong'
                        ? 'border-status-fragile text-status-fragile'
                        : 'border-primary/40 text-foreground',
                    ].join(' ')}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </span>
              )
            }

            return (
              <span key={idx} className="text-foreground">
                {token}
              </span>
            )
          })}
        </div>
      </div>

      {/* Feedback message */}
      {feedback === 'correct' && (
        <p className="text-center text-sm font-medium text-status-solid">
          &#10003; נכון!{' '}
          {attempt === 0 ? '+10 נקודות' : '+5 נקודות'}
        </p>
      )}
      {feedback === 'wrong' && (
        <p className="text-center text-sm font-medium text-status-fragile">
          לא מדויק, נסו שוב (ניסיון {attempt + 1} מתוך 2)
        </p>
      )}
      {feedback === 'revealed' && (
        <p className="text-center text-sm font-medium text-status-shaky">
          התשובה הנכונה: {current.blankWord}
        </p>
      )}

      {/* Submit button */}
      {!feedback && (
        <div className="flex justify-center">
          <Button
            variant="primary"
            onClick={checkInput}
            disabled={inputValue.trim().length === 0}
          >
            בדיקה
          </Button>
        </div>
      )}
    </div>
  )
}
