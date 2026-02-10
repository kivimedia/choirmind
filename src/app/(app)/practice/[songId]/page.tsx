'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FadeOutDisplay from '@/components/practice/FadeOutDisplay'
import SelfRatingButtons from '@/components/practice/SelfRatingButtons'
import FadeLevelIndicator from '@/components/practice/FadeLevelIndicator'
import PracticeSessionSummary from '@/components/practice/PracticeSessionSummary'
import Button from '@/components/ui/Button'
import { getNextFadeLevel, type SelfRatingLabel } from '@/lib/fade-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Chunk {
  id: string
  label: string
  lyrics: string
  fadeLevel: number
  status: string
}

interface SongData {
  id: string
  title: string
  chunks: Chunk[]
}

interface Improvement {
  chunkLabel: string
  oldStatus: string
  newStatus: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PracticeSessionPage() {
  const params = useParams<{ songId: string }>()
  const router = useRouter()
  const songId = params.songId

  // Data
  const [song, setSong] = useState<SongData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Session state
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [currentFadeLevel, setCurrentFadeLevel] = useState(0)
  const [sessionChunks, setSessionChunks] = useState<
    { chunkId: string; ratings: SelfRatingLabel[] }[]
  >([])
  const [isComplete, setIsComplete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Summary data
  const [xpEarned, setXpEarned] = useState(0)
  const [streak, setStreak] = useState(0)
  const [improvements, setImprovements] = useState<Improvement[]>([])

  // Session timing
  const sessionStartRef = useRef<Date>(new Date())

  // Fetch song data
  const fetchSong = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/songs/${songId}`)
      if (!res.ok) throw new Error('Failed to fetch song')
      const json: SongData = await res.json()
      setSong(json)

      // Initialize fade levels from the chunks
      if (json.chunks.length > 0) {
        setCurrentFadeLevel(json.chunks[0].fadeLevel ?? 0)
        setSessionChunks(
          json.chunks.map((c) => ({ chunkId: c.id, ratings: [] })),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת השיר')
    } finally {
      setLoading(false)
    }
  }, [songId])

  useEffect(() => {
    fetchSong()
    sessionStartRef.current = new Date()
  }, [fetchSong])

  // Current chunk
  const currentChunk = song?.chunks[currentChunkIndex] ?? null

  // Handle self-rating
  const handleRate = useCallback(
    async (rating: SelfRatingLabel) => {
      if (!currentChunk || !song || isSubmitting) return

      setIsSubmitting(true)

      try {
        // Post review to API
        const res = await fetch('/api/practice/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunkId: currentChunk.id,
            selfRating: rating,
            fadeLevel: currentFadeLevel,
          }),
        })

        if (res.ok) {
          const result = await res.json()
          // Track improvements
          if (result.improvement) {
            setImprovements((prev) => [
              ...prev,
              {
                chunkLabel: currentChunk.label,
                oldStatus: result.improvement.oldStatus,
                newStatus: result.improvement.newStatus,
              },
            ])
          }
          // Accumulate XP
          if (result.xp) {
            setXpEarned((prev) => prev + result.xp)
          }
          if (result.streak !== undefined) {
            setStreak(result.streak)
          }
        }
      } catch {
        // Non-critical — continue the session even if the POST fails
      }

      // Track rating in session
      setSessionChunks((prev) => {
        const updated = [...prev]
        if (updated[currentChunkIndex]) {
          updated[currentChunkIndex] = {
            ...updated[currentChunkIndex],
            ratings: [...updated[currentChunkIndex].ratings, rating],
          }
        }
        return updated
      })

      // Calculate next fade level
      const nextFade = getNextFadeLevel(currentFadeLevel, rating)

      // Advance to next chunk or complete
      const nextIndex = currentChunkIndex + 1
      if (nextIndex >= (song?.chunks.length ?? 0)) {
        // Session complete — post summary
        try {
          await fetch('/api/practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              songId,
              startedAt: sessionStartRef.current.toISOString(),
              completedAt: new Date().toISOString(),
              chunks: sessionChunks,
            }),
          })
        } catch {
          // Non-critical
        }
        setIsComplete(true)
      } else {
        setCurrentChunkIndex(nextIndex)
        // Use the next chunk's stored fade level, or the computed next level
        const nextChunkFade = song?.chunks[nextIndex]?.fadeLevel ?? nextFade
        setCurrentFadeLevel(nextChunkFade)
      }

      setIsSubmitting(false)
    },
    [currentChunk, currentChunkIndex, currentFadeLevel, isSubmitting, song, songId, sessionChunks],
  )

  // Word reveal handler
  const handleWordReveal = useCallback((index: number) => {
    // Could track reveals for analytics; no-op for now
  }, [])

  // -- Loading state --
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-text-muted">טוען את השיר...</p>
        </div>
      </div>
    )
  }

  // -- Error state --
  if (error || !song) {
    return (
      <div dir="rtl" className="py-12 text-center text-start">
        <p className="text-danger mb-4">{error ?? 'השיר לא נמצא'}</p>
        <Button variant="outline" onClick={() => router.push('/practice')}>
          חזרה לתרגול
        </Button>
      </div>
    )
  }

  // -- No chunks --
  if (song.chunks.length === 0) {
    return (
      <div dir="rtl" className="py-12 text-center text-start">
        <p className="text-text-muted mb-4">לשיר זה אין קטעים לתרגול.</p>
        <Button variant="outline" onClick={() => router.push('/practice')}>
          חזרה לתרגול
        </Button>
      </div>
    )
  }

  // -- Session complete --
  if (isComplete) {
    return (
      <PracticeSessionSummary
        chunksReviewed={song.chunks.length}
        xpEarned={xpEarned}
        streak={streak}
        improvements={improvements}
        onContinue={() => router.push('/practice/guided')}
        onFinish={() => router.push('/practice')}
      />
    )
  }

  // -- Active practice --
  return (
    <div dir="rtl" className="flex flex-col min-h-[calc(100vh-12rem)] text-start">
      {/* Top: Fade level indicator */}
      <div className="mb-6">
        <FadeLevelIndicator
          level={currentFadeLevel}
          songTitle={song.title}
          chunkLabel={currentChunk?.label ?? ''}
        />

        {/* Progress through chunks */}
        <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
          <span>
            קטע {currentChunkIndex + 1} מתוך {song.chunks.length}
          </span>
        </div>
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
