'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import { tokenizeHebrew } from '@/lib/hebrew-utils'
import {
  stripNikkud,
  fuzzyMatch,
  splitLyricsIntoLines,
  shuffleArray,
  formatTimer,
} from '@/lib/game-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinishTheLineProps {
  lyrics: string
  chunkLabel: string
  onComplete: (score: number) => void
}

interface ComparisonWord {
  word: string
  correct: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the first 2-3 words of a line as the prompt. Uses 3 words when the
 * line has more than 5 words, otherwise 2.
 */
function getPromptWords(line: string): { prompt: string; rest: string } {
  const tokens = tokenizeHebrew(line)
  const promptCount = tokens.length > 5 ? 3 : Math.min(2, tokens.length - 1)

  if (promptCount <= 0 || tokens.length <= promptCount) {
    return { prompt: line, rest: '' }
  }

  return {
    prompt: tokens.slice(0, promptCount).join(' '),
    rest: tokens.slice(promptCount).join(' '),
  }
}

/**
 * Build a word-by-word comparison, marking each expected word as correct
 * (green) or wrong (red). Also mark extra typed words as wrong.
 */
function buildComparison(
  typed: string,
  expected: string,
): ComparisonWord[] {
  const normalize = (s: string) =>
    stripNikkud(s).trim().replace(/\s+/g, ' ')

  const typedWords = normalize(typed).split(' ').filter(Boolean)
  const expectedWords = normalize(expected).split(' ').filter(Boolean)

  const result: ComparisonWord[] = []

  for (let i = 0; i < Math.max(typedWords.length, expectedWords.length); i++) {
    if (i < expectedWords.length && i < typedWords.length) {
      result.push({
        word: expectedWords[i],
        correct: typedWords[i] === expectedWords[i],
      })
    } else if (i < expectedWords.length) {
      // Missing word
      result.push({ word: expectedWords[i], correct: false })
    } else {
      // Extra typed word (not in expected)
      result.push({ word: typedWords[i], correct: false })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FinishTheLine({
  lyrics,
  chunkLabel,
  onComplete,
}: FinishTheLineProps) {
  const rawLines = splitLyricsIntoLines(lyrics)

  // Shuffle line order for variety
  const [lineOrder] = useState<number[]>(() =>
    shuffleArray(rawLines.map((_, i) => i)),
  )

  const [currentIdx, setCurrentIdx] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [comparison, setComparison] = useState<ComparisonWord[]>([])
  const [lineAccuracy, setLineAccuracy] = useState(0)
  const [totalAccuracy, setTotalAccuracy] = useState(0)
  const [linesCompleted, setLinesCompleted] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const currentLineFullIdx = lineOrder[currentIdx] ?? 0
  const currentLine = rawLines[currentLineFullIdx] ?? ''
  const { prompt, rest } = getPromptWords(currentLine)

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Focus textarea
  useEffect(() => {
    if (!submitted && !gameOver) {
      textareaRef.current?.focus()
    }
  }, [currentIdx, submitted, gameOver])

  // -----------------------------------------------------------------------
  // Submit answer
  // -----------------------------------------------------------------------

  const submitAnswer = useCallback(() => {
    const { accuracy } = fuzzyMatch(inputValue.trim(), rest)
    const comp = buildComparison(inputValue.trim(), rest)

    setComparison(comp)
    setLineAccuracy(accuracy)
    setSubmitted(true)

    setTotalAccuracy((prev) => prev + accuracy)
    setLinesCompleted((prev) => prev + 1)
  }, [inputValue, rest])

  // -----------------------------------------------------------------------
  // Next line
  // -----------------------------------------------------------------------

  const nextLine = () => {
    const nextIdx = currentIdx + 1
    if (nextIdx >= lineOrder.length) {
      setGameOver(true)
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    setCurrentIdx(nextIdx)
    setInputValue('')
    setSubmitted(false)
    setComparison([])
    setLineAccuracy(0)
  }

  // -----------------------------------------------------------------------
  // Score calculation
  // -----------------------------------------------------------------------

  const computeScore = () => {
    if (linesCompleted === 0) return 0
    const avgAccuracy = totalAccuracy / linesCompleted
    return Math.round(avgAccuracy * 100)
  }

  // -----------------------------------------------------------------------
  // Game over
  // -----------------------------------------------------------------------

  if (gameOver) {
    const finalScore = computeScore()
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="text-5xl" aria-hidden="true">
          &#128221;
        </div>
        <h2 className="text-2xl font-bold text-foreground">סיום שורה</h2>
        <p className="text-text-muted">{chunkLabel}</p>
        <div className="rounded-xl bg-primary/10 px-8 py-4">
          <span className="text-4xl font-bold text-primary">{finalScore}</span>
          <span className="ms-2 text-lg text-text-muted">/ 100</span>
        </div>
        <p className="text-sm text-text-muted">
          דיוק ממוצע: {Math.round((totalAccuracy / linesCompleted) * 100)}%
          &middot; זמן: {formatTimer(elapsedSeconds)}
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => onComplete(finalScore)}
        >
          סיום
        </Button>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            סיום שורה
          </h3>
          <p className="text-sm text-text-muted">{chunkLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary tabular-nums">
            {formatTimer(elapsedSeconds)}
          </span>
          <span className="text-sm text-text-muted">
            {currentIdx + 1} / {lineOrder.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{
            width: `${((currentIdx) / lineOrder.length) * 100}%`,
          }}
        />
      </div>

      {/* Prompt */}
      <div className="rounded-xl border border-border bg-surface p-4" dir="rtl">
        <p className="mb-1 text-xs text-text-muted text-start">
          השלימו את השורה:
        </p>
        <p className="text-xl font-bold text-foreground leading-relaxed">
          {prompt}
          <span className="text-primary/50"> ...</span>
        </p>
      </div>

      {/* Input area */}
      {!submitted && (
        <div>
          <textarea
            ref={textareaRef}
            dir="rtl"
            rows={2}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitAnswer()
              }
            }}
            placeholder="הקלידו את המשך השורה..."
            className={[
              'w-full rounded-lg border border-border bg-background px-4 py-3',
              'text-foreground text-lg leading-relaxed placeholder:text-text-muted',
              'transition-colors duration-150 resize-none',
              'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            ].join(' ')}
          />
          <div className="mt-3 flex justify-center">
            <Button
              variant="primary"
              onClick={submitAnswer}
              disabled={inputValue.trim().length === 0}
            >
              בדיקה
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {submitted && (
        <div className="flex flex-col gap-4">
          {/* Accuracy badge */}
          <div className="flex items-center justify-center gap-2">
            {lineAccuracy === 1 ? (
              <span className="rounded-full bg-status-solid/15 px-4 py-1 text-sm font-bold text-status-solid">
                &#10003; נכון!
              </span>
            ) : (
              <span className="rounded-full bg-status-shaky/15 px-4 py-1 text-sm font-bold text-status-shaky">
                דיוק: {Math.round(lineAccuracy * 100)}%
              </span>
            )}
          </div>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* What you typed */}
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="mb-2 text-xs font-medium text-text-muted text-start">
                מה כתבת:
              </p>
              <p className="text-base leading-relaxed" dir="rtl">
                {inputValue.trim() || (
                  <span className="text-text-muted">(ריק)</span>
                )}
              </p>
            </div>

            {/* Correct text with highlighting */}
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="mb-2 text-xs font-medium text-text-muted text-start">
                התשובה הנכונה:
              </p>
              <div
                className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-base leading-relaxed"
                dir="rtl"
              >
                {comparison.map((cw, i) => (
                  <span
                    key={i}
                    className={
                      cw.correct
                        ? 'text-status-solid font-medium'
                        : 'rounded bg-status-fragile/15 px-0.5 text-status-fragile font-medium'
                    }
                  >
                    {cw.word}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Next button */}
          <div className="flex justify-center">
            <Button variant="secondary" onClick={nextLine}>
              {currentIdx + 1 < lineOrder.length ? 'שורה הבאה' : 'סיכום'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
