'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import FadeOutDisplay from '@/components/practice/FadeOutDisplay'
import SelfRatingButtons from '@/components/practice/SelfRatingButtons'
import FadeLevelIndicator from '@/components/practice/FadeLevelIndicator'
import PracticeSessionSummary from '@/components/practice/PracticeSessionSummary'
import ProgressBar from '@/components/ui/ProgressBar'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { getNextFadeLevel, type SelfRatingLabel } from '@/lib/fade-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GuidedChunk {
  chunkId: string
  songId: string
  songTitle: string
  chunkLabel: string
  lyrics: string
  fadeLevel: number
  status: string
}

interface Improvement {
  chunkLabel: string
  oldStatus: string
  newStatus: string
}

interface PracticeQueueResponse {
  queue: GuidedChunk[]
  stats: {
    streak: number
    xp: number
    dueCount: number
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuidedPracticePage() {
  const router = useRouter()

  // Data
  const [queue, setQueue] = useState<GuidedChunk[]>([])
  const [stats, setStats] = useState({ streak: 0, xp: 0, dueCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Session state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentFadeLevel, setCurrentFadeLevel] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Summary
  const [xpEarned, setXpEarned] = useState(0)
  const [streak, setStreak] = useState(0)
  const [improvements, setImprovements] = useState<Improvement[]>([])

  // Timing
  const sessionStartRef = useRef<Date>(new Date())

  // Fetch review queue
  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/practice')
      if (!res.ok) throw new Error('Failed to fetch practice queue')
      const json: PracticeQueueResponse = await res.json()
      setQueue(json.queue ?? [])
      setStats(json.stats ?? { streak: 0, xp: 0, dueCount: 0 })

      // Initialize first chunk fade level
      if (json.queue && json.queue.length > 0) {
        setCurrentFadeLevel(json.queue[0].fadeLevel ?? 0)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת תור תרגול')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQueue()
    sessionStartRef.current = new Date()
  }, [fetchQueue])

  const currentChunk = queue[currentIndex] ?? null
  const progress =
    queue.length > 0 ? ((currentIndex + 1) / queue.length) * 100 : 0

  // Handle self-rating
  const handleRate = useCallback(
    async (rating: SelfRatingLabel) => {
      if (!currentChunk || isSubmitting) return

      setIsSubmitting(true)

      try {
        // Post review
        const res = await fetch('/api/practice/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunkId: currentChunk.chunkId,
            selfRating: rating,
            fadeLevel: currentFadeLevel,
          }),
        })

        if (res.ok) {
          const result = await res.json()
          if (result.improvement) {
            setImprovements((prev) => [
              ...prev,
              {
                chunkLabel: `${currentChunk.songTitle} — ${currentChunk.chunkLabel}`,
                oldStatus: result.improvement.oldStatus,
                newStatus: result.improvement.newStatus,
              },
            ])
          }
          if (result.xp) {
            setXpEarned((prev) => prev + result.xp)
          }
          if (result.streak !== undefined) {
            setStreak(result.streak)
          }
        }
      } catch {
        // Non-critical
      }

      // Calculate next fade level
      const nextFade = getNextFadeLevel(currentFadeLevel, rating)

      // Advance to next chunk or finish
      const nextIdx = currentIndex + 1
      if (nextIdx >= queue.length) {
        // Post session summary
        try {
          await fetch('/api/practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'guided',
              startedAt: sessionStartRef.current.toISOString(),
              completedAt: new Date().toISOString(),
              chunksReviewed: queue.length,
            }),
          })
        } catch {
          // Non-critical
        }
        setIsComplete(true)
      } else {
        setCurrentIndex(nextIdx)
        // Use the queued chunk's fade level or computed next level
        const nextChunkFade = queue[nextIdx]?.fadeLevel ?? nextFade
        setCurrentFadeLevel(nextChunkFade)
      }

      setIsSubmitting(false)
    },
    [currentChunk, currentFadeLevel, currentIndex, isSubmitting, queue],
  )

  // Word reveal handler
  const handleWordReveal = useCallback((index: number) => {
    // Could track reveals for analytics
  }, [])

  // -- Loading --
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-text-muted">טוען תרגול מודרך...</p>
        </div>
      </div>
    )
  }

  // -- Error --
  if (error) {
    return (
      <div dir="rtl" className="py-12 text-center text-start">
        <p className="text-danger mb-4">{error}</p>
        <Button variant="outline" onClick={fetchQueue}>
          נסה שנית
        </Button>
      </div>
    )
  }

  // -- Empty queue --
  if (queue.length === 0) {
    return (
      <div dir="rtl" className="text-start">
        <EmptyState
          icon="🎉"
          title="אין קטעים לחזרה כרגע"
          description="כל הקטעים מעודכנים! חזרו מאוחר יותר או בחרו שיר לתרגול חופשי."
          actionLabel="חזרה לתרגול"
          onAction={() => router.push('/practice')}
        />
      </div>
    )
  }

  // -- Session complete --
  if (isComplete) {
    return (
      <PracticeSessionSummary
        chunksReviewed={queue.length}
        xpEarned={xpEarned}
        streak={streak}
        improvements={improvements}
        onContinue={() => {
          // Re-fetch queue for another round
          setIsComplete(false)
          setCurrentIndex(0)
          setXpEarned(0)
          setImprovements([])
          fetchQueue()
        }}
        onFinish={() => router.push('/practice')}
      />
    )
  }

  // -- Active guided practice --
  return (
    <div dir="rtl" className="flex flex-col min-h-[calc(100vh-12rem)] text-start">
      {/* Top section: progress + fade level */}
      <div className="mb-4">
        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-text-muted">
              קטע {currentIndex + 1} מתוך {queue.length}
            </span>
            <span className="text-sm font-medium text-primary tabular-nums">
              {Math.round(progress)}%
            </span>
          </div>
          <ProgressBar value={progress} size="sm" />
        </div>

        {/* Fade level indicator */}
        <FadeLevelIndicator
          level={currentFadeLevel}
          songTitle={currentChunk?.songTitle ?? ''}
          chunkLabel={currentChunk?.chunkLabel ?? ''}
        />
      </div>

      {/* Middle: Lyrics display */}
      <div className="flex-1 rounded-xl border border-border bg-surface p-4 sm:p-6 mb-6 overflow-y-auto practice-scroll">
        {currentChunk && (
          <FadeOutDisplay
            lyrics={currentChunk.lyrics}
            fadeLevel={currentFadeLevel}
            onWordReveal={handleWordReveal}
          />
        )}
      </div>

      {/* Bottom: Rating buttons */}
      <div className="pb-4">
        <SelfRatingButtons onRate={handleRate} disabled={isSubmitting} />
      </div>
    </div>
  )
}
