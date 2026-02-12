'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FadeOutDisplay from '@/components/practice/FadeOutDisplay'
import KaraokeDisplay from '@/components/practice/KaraokeDisplay'
import SelfRatingButtons from '@/components/practice/SelfRatingButtons'
import FadeLevelIndicator from '@/components/practice/FadeLevelIndicator'
import PracticeSessionSummary from '@/components/practice/PracticeSessionSummary'
import AudioPlayer from '@/components/audio/AudioPlayer'
import Button from '@/components/ui/Button'
import { getNextFadeLevel, type SelfRatingLabel } from '@/lib/fade-engine'
import type { AudioTrackData, VoicePart } from '@/lib/audio/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Chunk {
  id: string
  label: string
  lyrics: string
  fadeLevel: number
  status: string
  lineTimestamps: number[] | null
  audioStartMs?: number | null
}

interface SongData {
  id: string
  title: string
  chunks: Chunk[]
  spotifyTrackId?: string | null
  spotifyEmbed?: string | null
  youtubeVideoId?: string | null
  audioTracks?: AudioTrackData[]
}

interface Improvement {
  chunkLabel: string
  oldStatus: string
  newStatus: string
}

const FADE_LEVEL_LABELS: Record<number, string> = {
  0: 'מלא',
  1: 'רמה 1',
  2: 'רמה 2',
  3: 'רמה 3',
  4: 'רמה 4',
  5: 'רמה 5',
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
  const [manualFadeOverride, setManualFadeOverride] = useState<number | null>(null)
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

  // Karaoke time tracking
  const [currentTimeMs, setCurrentTimeMs] = useState(0)

  // Manual seek (e.g. from clicking a lyric line)
  const [manualSeekMs, setManualSeekMs] = useState<number | null>(null)

  // Toggles
  const [showFullLyrics, setShowFullLyrics] = useState(false)

  // Fetch song data + user chunk progress + audio tracks
  const fetchSong = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch song, progress, and audio tracks in parallel
      const [songRes, progressRes, audioRes] = await Promise.all([
        fetch(`/api/songs/${songId}`),
        fetch(`/api/practice?songId=${songId}`),
        fetch(`/api/songs/${songId}/audio-tracks`),
      ])

      if (!songRes.ok) throw new Error('Failed to fetch song')
      const songJson = await songRes.json()
      const raw = songJson.song ?? songJson

      // Parse progress into a map
      const progressMap = new Map<string, { fadeLevel: number; status: string }>()
      if (progressRes.ok) {
        const progressJson = await progressRes.json()
        if (Array.isArray(progressJson.progress)) {
          for (const p of progressJson.progress) {
            progressMap.set(p.chunkId, {
              fadeLevel: p.fadeLevel ?? 0,
              status: p.status ?? 'fragile',
            })
          }
        }
      }

      // Parse audio tracks
      let audioTracks: AudioTrackData[] = []
      if (audioRes.ok) {
        const audioJson = await audioRes.json()
        audioTracks = audioJson.audioTracks ?? []
      }

      const songData: SongData = {
        ...raw,
        audioTracks,
        chunks: (raw.chunks || []).map((c: any) => {
          const progress = progressMap.get(c.id)
          return {
            ...c,
            lineTimestamps: c.lineTimestamps ? JSON.parse(c.lineTimestamps) : null,
            fadeLevel: progress?.fadeLevel ?? 0,
            status: progress?.status ?? 'fragile',
          }
        }),
      }
      setSong(songData)

      // Initialize from the first chunk
      if (songData.chunks?.length > 0) {
        setCurrentFadeLevel(songData.chunks[0].fadeLevel)
        setSessionChunks(
          songData.chunks.map((c) => ({ chunkId: c.id, ratings: [] })),
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

  // Auto-seek to chunk start when chunk changes
  const seekTarget = useMemo(() => {
    if (!song?.chunks?.[currentChunkIndex]) return null
    const chunk = song.chunks[currentChunkIndex]
    if (chunk.lineTimestamps && chunk.lineTimestamps.length > 0) {
      return Math.max(0, chunk.lineTimestamps[0] - 2000)
    }
    if (chunk.audioStartMs != null) return chunk.audioStartMs
    return null
  }, [currentChunkIndex, song])

  // Current chunk
  const currentChunk = song?.chunks?.[currentChunkIndex] ?? null

  // Effective fade level: manual override > show full > first time > chunk's level
  const isFirstTime = currentChunk?.status === 'fragile'
  const effectiveFadeLevel =
    manualFadeOverride !== null
      ? manualFadeOverride
      : (showFullLyrics || isFirstTime) ? 0 : currentFadeLevel

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
        setCurrentTimeMs(0)
        setManualFadeOverride(null) // reset manual override on chunk change
        // Use the next chunk's stored fade level, or the computed next level
        const nextChunkFade = song?.chunks[nextIndex]?.fadeLevel ?? nextFade
        setCurrentFadeLevel(nextChunkFade)
      }

      setIsSubmitting(false)
    },
    [currentChunk, currentChunkIndex, currentFadeLevel, isSubmitting, song, songId, sessionChunks],
  )

  // Keyboard navigation (arrow keys to switch chunks)
  useEffect(() => {
    if (!song || isComplete) return
    function handleKeyDown(e: KeyboardEvent) {
      // In RTL: ArrowRight = previous, ArrowLeft = next
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentChunkIndex((prev) => {
          const next = prev - 1
          if (next < 0) return prev
          setCurrentTimeMs(0)
          setManualFadeOverride(null)
          setManualSeekMs(null)
          setCurrentFadeLevel(song!.chunks[next]?.fadeLevel ?? 0)
          return next
        })
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentChunkIndex((prev) => {
          const next = prev + 1
          if (next >= (song?.chunks.length ?? 0)) return prev
          setCurrentTimeMs(0)
          setManualFadeOverride(null)
          setManualSeekMs(null)
          setCurrentFadeLevel(song!.chunks[next]?.fadeLevel ?? 0)
          return next
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [song, isComplete])

  // Handle click on lyrics line to seek
  const handleLineSeek = useCallback((timestampMs: number) => {
    setManualSeekMs(timestampMs)
    // Reset after a tick so the same timestamp can be re-clicked
    setTimeout(() => setManualSeekMs(null), 100)
  }, [])

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
      <div className="mb-4">
        <FadeLevelIndicator
          level={effectiveFadeLevel}
          songTitle={song.title}
          chunkLabel={currentChunk?.label ?? ''}
        />

        {/* Progress through chunks + nav + edit link */}
        <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
          <button
            type="button"
            disabled={currentChunkIndex === 0}
            onClick={() => {
              const prevIdx = currentChunkIndex - 1
              setCurrentChunkIndex(prevIdx)
              setCurrentTimeMs(0)
              setManualFadeOverride(null)
              setCurrentFadeLevel(song.chunks[prevIdx]?.fadeLevel ?? 0)
            }}
            className="rounded-full p-2.5 hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="קטע קודם"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span>
            קטע {currentChunkIndex + 1} מתוך {song.chunks.length}
          </span>
          <button
            type="button"
            disabled={currentChunkIndex >= song.chunks.length - 1}
            onClick={() => {
              const nextIdx = currentChunkIndex + 1
              setCurrentChunkIndex(nextIdx)
              setCurrentTimeMs(0)
              setManualFadeOverride(null)
              setCurrentFadeLevel(song.chunks[nextIdx]?.fadeLevel ?? 0)
            }}
            className="rounded-full p-2.5 hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="קטע הבא"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => router.push(`/songs/${songId}/edit`)}
            className="ms-auto text-xs text-primary hover:underline"
          >
            עריכה
          </button>
        </div>

        {/* Controls row */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {/* Show full lyrics toggle */}
          <button
            type="button"
            onClick={() => {
              setShowFullLyrics((v) => !v)
              setManualFadeOverride(null)
            }}
            className={[
              'flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors border',
              showFullLyrics && manualFadeOverride === null
                ? 'bg-primary/15 border-primary text-primary'
                : 'bg-surface border-border text-text-muted hover:border-primary/50',
            ].join(' ')}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showFullLyrics ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' : 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18'} />
            </svg>
            {showFullLyrics ? 'מילים מלאות' : 'הצג הכל'}
            {isFirstTime && !showFullLyrics && manualFadeOverride === null && (
              <span className="text-[10px] opacity-70">(ראשונה)</span>
            )}
          </button>

          {/* Manual fade level selector */}
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1">
            {[0, 1, 2, 3, 4, 5].map((level) => {
              const isActive = effectiveFadeLevel === level
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    setManualFadeOverride(level)
                    setShowFullLyrics(false)
                  }}
                  className={[
                    'rounded-full px-2.5 py-1 transition-colors text-xs font-medium min-w-[32px] min-h-[32px] flex items-center justify-center',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-text-muted hover:bg-surface-hover',
                  ].join(' ')}
                  title={FADE_LEVEL_LABELS[level]}
                >
                  {level}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Audio player — handles Howler/YouTube/Spotify with voice part switching */}
      <div className="mb-4">
        <AudioPlayer
          audioTracks={song.audioTracks ?? []}
          youtubeVideoId={song.youtubeVideoId}
          spotifyTrackId={song.spotifyTrackId}
          onTimeUpdate={setCurrentTimeMs}
          seekToMs={manualSeekMs ?? seekTarget}
        />
      </div>

      {/* Middle: Lyrics display */}
      <div className="flex-1 rounded-xl border border-border bg-surface p-4 sm:p-6 mb-6 overflow-y-auto practice-scroll">
        {currentChunk && (
          currentChunk.lineTimestamps ? (
            <KaraokeDisplay
              lyrics={currentChunk.lyrics}
              fadeLevel={effectiveFadeLevel}
              timestamps={currentChunk.lineTimestamps}
              currentTimeMs={currentTimeMs}
              onWordReveal={handleWordReveal}
              onLineClick={handleLineSeek}
            />
          ) : (
            <FadeOutDisplay
              lyrics={currentChunk.lyrics}
              fadeLevel={effectiveFadeLevel}
              onWordReveal={handleWordReveal}
            />
          )
        )}
      </div>

      {/* Bottom: Rating buttons */}
      <div className="pb-4">
        <SelfRatingButtons onRate={handleRate} disabled={isSubmitting} />
      </div>
    </div>
  )
}
