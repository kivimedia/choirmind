'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import { tokenizeHebrew } from '@/lib/hebrew-utils'
import {
  shuffleArray,
  splitLyricsIntoLines,
  formatTimer,
} from '@/lib/game-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WordScrambleProps {
  lyrics: string
  chunkLabel: string
  onComplete: (score: number) => void
}

interface WordChip {
  id: string
  text: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WordScramble({
  lyrics,
  chunkLabel,
  onComplete,
}: WordScrambleProps) {
  const lines = splitLyricsIntoLines(lyrics)

  const [currentLineIdx, setCurrentLineIdx] = useState(0)
  const [pool, setPool] = useState<WordChip[]>([])
  const [answer, setAnswer] = useState<WordChip[]>([])
  const [correctTokens, setCorrectTokens] = useState<string[]>([])
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const [score, setScore] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [shakeAnswer, setShakeAnswer] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lineStartTimeRef = useRef<number>(Date.now())

  // -----------------------------------------------------------------------
  // Initialize / reset line
  // -----------------------------------------------------------------------

  const initLine = useCallback(
    (lineIdx: number) => {
      if (lineIdx >= lines.length) {
        setGameOver(true)
        if (timerRef.current) clearInterval(timerRef.current)
        return
      }

      const tokens = tokenizeHebrew(lines[lineIdx])
      setCorrectTokens(tokens)

      const chips: WordChip[] = tokens.map((t, i) => ({
        id: `${lineIdx}-${i}`,
        text: t,
      }))

      setPool(shuffleArray(chips))
      setAnswer([])
      setResult(null)
      setShakeAnswer(false)
      lineStartTimeRef.current = Date.now()
    },
    [lines],
  )

  // Start the game
  useEffect(() => {
    initLine(0)

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------------------------------------------------
  // Tap to select / deselect
  // -----------------------------------------------------------------------

  const selectWord = (chip: WordChip) => {
    if (result) return
    setPool((prev) => prev.filter((c) => c.id !== chip.id))
    setAnswer((prev) => [...prev, chip])
  }

  const deselectWord = (chip: WordChip) => {
    if (result) return
    setAnswer((prev) => prev.filter((c) => c.id !== chip.id))
    setPool((prev) => [...prev, chip])
  }

  // -----------------------------------------------------------------------
  // Check answer
  // -----------------------------------------------------------------------

  const checkAnswer = () => {
    const answerTokens = answer.map((c) => c.text)
    const isCorrect =
      answerTokens.length === correctTokens.length &&
      answerTokens.every((t, i) => t === correctTokens[i])

    if (isCorrect) {
      setResult('correct')
      // Speed bonus: +5 if < 30 seconds for this line
      const timeTaken = (Date.now() - lineStartTimeRef.current) / 1000
      const lineScore = 10 + (timeTaken < 30 ? 5 : 0)
      setScore((prev) => prev + lineScore)
    } else {
      setResult('wrong')
      setShakeAnswer(true)
      setTimeout(() => setShakeAnswer(false), 600)
    }
  }

  // -----------------------------------------------------------------------
  // Advance to next line
  // -----------------------------------------------------------------------

  const nextLine = () => {
    const nextIdx = currentLineIdx + 1
    setCurrentLineIdx(nextIdx)
    initLine(nextIdx)
  }

  // -----------------------------------------------------------------------
  // Game over
  // -----------------------------------------------------------------------

  if (gameOver) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="text-5xl" aria-hidden="true">
          &#127942;
        </div>
        <h2 className="text-2xl font-bold text-foreground">כל הכבוד!</h2>
        <p className="text-text-muted">{chunkLabel}</p>
        <div className="rounded-xl bg-primary/10 px-8 py-4">
          <span className="text-4xl font-bold text-primary">{score}</span>
          <span className="ms-2 text-lg text-text-muted">נקודות</span>
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
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            סדר מילים
          </h3>
          <p className="text-sm text-text-muted">{chunkLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary tabular-nums">
            {formatTimer(elapsedSeconds)}
          </span>
          <span className="text-sm text-text-muted">
            שורה {currentLineIdx + 1} מתוך {lines.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{
            width: `${((currentLineIdx) / lines.length) * 100}%`,
          }}
        />
      </div>

      {/* Score display */}
      <div className="text-center">
        <span className="text-sm text-text-muted">ניקוד: </span>
        <span className="font-bold text-primary">{score}</span>
      </div>

      {/* Answer area */}
      <div className="min-h-[72px] rounded-xl border-2 border-dashed border-border bg-surface p-3">
        <p className="mb-2 text-xs text-text-muted text-start">
          התשובה שלך:
        </p>
        <div
          className={[
            'flex flex-wrap gap-2',
            shakeAnswer ? 'animate-shake' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          dir="rtl"
        >
          {answer.length === 0 && (
            <p className="text-sm text-text-muted/50">
              לחצו על מילים למטה כדי לסדר...
            </p>
          )}
          {answer.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => deselectWord(chip)}
              className={[
                'rounded-lg px-3 py-1.5 text-base font-medium transition-all duration-150',
                'cursor-pointer select-none',
                result === 'correct'
                  ? 'bg-status-solid/15 text-status-solid border border-status-solid/30'
                  : result === 'wrong'
                    ? 'bg-status-fragile/15 text-status-fragile border border-status-fragile/30'
                    : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 active:scale-95',
              ].join(' ')}
            >
              {chip.text}
            </button>
          ))}
        </div>
      </div>

      {/* Word pool */}
      <div className="rounded-xl border border-border bg-background p-3">
        <p className="mb-2 text-xs text-text-muted text-start">
          מילים לסידור:
        </p>
        <div className="flex flex-wrap gap-2" dir="rtl">
          {pool.length === 0 && answer.length > 0 && (
            <p className="text-sm text-text-muted/50">כל המילים מסודרות</p>
          )}
          {pool.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => selectWord(chip)}
              disabled={!!result}
              className={[
                'rounded-lg border border-border bg-surface px-3 py-1.5 text-base font-medium',
                'transition-all duration-150',
                'hover:border-primary-light hover:bg-primary/5 active:scale-95',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'cursor-pointer select-none',
              ].join(' ')}
            >
              {chip.text}
            </button>
          ))}
        </div>
      </div>

      {/* Correct answer reveal (on wrong) */}
      {result === 'wrong' && (
        <div className="rounded-xl border border-status-fragile/30 bg-status-fragile/5 p-3">
          <p className="mb-1 text-xs font-medium text-status-fragile text-start">
            הסדר הנכון:
          </p>
          <p className="text-base text-foreground" dir="rtl">
            {correctTokens.join(' ')}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-center gap-3">
        {!result && (
          <Button
            variant="primary"
            onClick={checkAnswer}
            disabled={answer.length !== correctTokens.length}
          >
            בדיקה
          </Button>
        )}
        {result && (
          <Button variant="secondary" onClick={nextLine}>
            {currentLineIdx + 1 < lines.length ? 'שורה הבאה' : 'סיכום'}
          </Button>
        )}
      </div>

      {/* Inline shake animation style */}
      <style jsx global>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          10%,
          30%,
          50%,
          70%,
          90% {
            transform: translateX(-4px);
          }
          20%,
          40%,
          60%,
          80% {
            transform: translateX(4px);
          }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  )
}
