'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Improvement {
  chunkLabel: string
  oldStatus: string
  newStatus: string
}

interface PracticeSessionSummaryProps {
  chunksReviewed: number
  xpEarned: number
  streak: number
  improvements: Improvement[]
  onContinue?: () => void
  onFinish?: () => void
}

// ---------------------------------------------------------------------------
// Status label map (Hebrew)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  fragile: 'שביר',
  shaky: 'רעוע',
  developing: 'מתפתח',
  solid: 'יציב',
  locked_in: 'נעול',
}

function localizeStatus(status: string): string {
  return STATUS_LABELS[status] ?? status
}

// ---------------------------------------------------------------------------
// Confetti effect
// ---------------------------------------------------------------------------

const CONFETTI_EMOJIS = ['🎉', '🎊', '⭐', '🌟', '✨', '🏆', '🎶', '🎵']

function ConfettiOverlay() {
  const [particles, setParticles] = useState<
    { id: number; emoji: string; x: number; delay: number; duration: number }[]
  >([])

  useEffect(() => {
    const generated = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      emoji: CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)],
      x: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2 + Math.random() * 2,
    }))
    setParticles(generated)
  }, [])

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute text-2xl animate-bounce"
          style={{
            left: `${p.x}%`,
            top: '-10%',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            animationFillMode: 'forwards',
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PracticeSessionSummary({
  chunksReviewed,
  xpEarned,
  streak,
  improvements,
  onContinue,
  onFinish,
}: PracticeSessionSummaryProps) {
  return (
    <div dir="rtl" className="relative w-full max-w-lg mx-auto text-start px-4 py-8">
      {/* Confetti celebration */}
      <ConfettiOverlay />

      {/* Title */}
      <div className="text-center mb-8">
        <span className="text-5xl mb-3 block" role="img" aria-label="celebration">
          🎉
        </span>
        <h2 className="text-2xl font-bold text-foreground">כל הכבוד!</h2>
        <p className="text-text-muted mt-1">סיכום תרגול</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="text-center">
          <div className="text-3xl font-bold text-primary">{chunksReviewed}</div>
          <div className="text-xs text-text-muted mt-1">קטעים</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-secondary">{xpEarned}</div>
          <div className="text-xs text-text-muted mt-1">XP</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-accent">{streak}</div>
          <div className="text-xs text-text-muted mt-1">רצף ימים</div>
        </Card>
      </div>

      {/* Improvements list */}
      {improvements.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-3">שיפורים</h3>
          <ul className="space-y-2">
            {improvements.map((imp, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 rounded-lg bg-status-solid/10 px-4 py-3 text-sm"
              >
                <span className="text-status-solid font-bold">↑</span>
                <span className="font-medium text-foreground">{imp.chunkLabel}:</span>
                <span className="text-text-muted">
                  {localizeStatus(imp.oldStatus)} → {localizeStatus(imp.newStatus)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        {onContinue && (
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={onContinue}
          >
            המשך
          </Button>
        )}
        {onFinish && (
          <Button
            variant={onContinue ? 'outline' : 'primary'}
            size="lg"
            className="flex-1"
            onClick={onFinish}
          >
            סיום
          </Button>
        )}
      </div>
    </div>
  )
}
