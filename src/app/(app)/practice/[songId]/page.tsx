'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FadeOutDisplay from '@/components/practice/FadeOutDisplay'
import KaraokeDisplay from '@/components/practice/KaraokeDisplay'
import SelfRatingButtons from '@/components/practice/SelfRatingButtons'
import FadeLevelIndicator from '@/components/practice/FadeLevelIndicator'
import PracticeSessionSummary from '@/components/practice/PracticeSessionSummary'
import AudioPlayer from '@/components/audio/AudioPlayer'
import AudioModeSelector, { type AudioMode } from '@/components/audio/AudioModeSelector'
import type { AudioActions } from '@/components/audio/AudioPlayer'
import Button from '@/components/ui/Button'
import { type SelfRatingLabel } from '@/lib/fade-engine'
import { computeChunkBoundaries, getActiveChunkIndex, type ChunkBoundary } from '@/lib/chunk-boundaries'
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
  audioEndMs?: number | null
}

interface ReferenceVocal {
  id: string
  voicePart: string
  isolatedFileUrl: string | null
  accompanimentFileUrl: string | null
  durationMs: number
}

interface SongData {
  id: string
  title: string
  chunks: Chunk[]
  spotifyTrackId?: string | null
  spotifyEmbed?: string | null
  youtubeVideoId?: string | null
  audioTracks?: AudioTrackData[]
  referenceVocals?: ReferenceVocal[]
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

const VOICE_PART_LABELS: Record<string, string> = {
  soprano: 'סופרן',
  alto: 'אלט',
  tenor: 'טנור',
  bass: 'בס',
}

// Default audio mode based on fade level
function getDefaultAudioMode(fadeLevel: number): AudioMode {
  if (fadeLevel >= 4) return 'music_only'
  if (fadeLevel >= 3) return 'vocals_only'
  return 'full_mix'
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
  const [isComplete, setIsComplete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showRating, setShowRating] = useState(false)

  // Audio mode
  const [audioMode, setAudioMode] = useState<AudioMode>('full_mix')
  const [userVoicePart, setUserVoicePart] = useState<string | null>(null)

  // Summary data
  const [xpEarned, setXpEarned] = useState(0)
  const [streak, setStreak] = useState(0)
  const [improvements, setImprovements] = useState<Improvement[]>([])

  // Session timing
  const sessionStartRef = useRef<Date>(new Date())
  const audioActionsRef = useRef<AudioActions | null>(null)

  // Karaoke time tracking
  const [currentTimeMs, setCurrentTimeMs] = useState(0)

  // Manual seek
  const [manualSeekMs, setManualSeekMs] = useState<number | null>(null)

  // Toggles
  const [showFullLyrics, setShowFullLyrics] = useState(false)

  // Chunk boundaries for auto-advance
  const [boundaries, setBoundaries] = useState<ChunkBoundary[]>([])

  // Track whether playback has reached the end
  const prevChunkIndexRef = useRef(0)
  const songEndedRef = useRef(false)

  // Fetch song data + user chunk progress + audio tracks
  const fetchSong = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [songRes, progressRes, audioRes, userRes] = await Promise.all([
        fetch(`/api/songs/${songId}`),
        fetch(`/api/practice?songId=${songId}`),
        fetch(`/api/songs/${songId}/audio-tracks`),
        fetch('/api/user/profile'),
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

      // Get user voice part
      if (userRes.ok) {
        const userJson = await userRes.json()
        setUserVoicePart(userJson.user?.voicePart ?? null)
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

      // Compute unified fade level: minimum across all chunks
      if (songData.chunks?.length > 0) {
        const minFade = Math.min(...songData.chunks.map((c) => c.fadeLevel))
        setCurrentFadeLevel(minFade)
        setAudioMode(getDefaultAudioMode(minFade))
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

  // Compute chunk boundaries when song loads
  useEffect(() => {
    if (!song?.chunks?.length) return
    // Estimate total duration from audio engine or last chunk
    const lastChunk = song.chunks[song.chunks.length - 1]
    let estimatedDuration = 0
    if (lastChunk.audioEndMs) {
      estimatedDuration = lastChunk.audioEndMs
    } else if (lastChunk.lineTimestamps?.length) {
      // Rough estimate: last timestamp + 30 seconds
      estimatedDuration = lastChunk.lineTimestamps[lastChunk.lineTimestamps.length - 1] + 30000
    }
    // Will be updated with actual duration from audio engine
    const b = computeChunkBoundaries(song.chunks, estimatedDuration || 300000)
    setBoundaries(b)
  }, [song])

  // Update boundaries when we get actual audio duration
  const handleTimeUpdate = useCallback((ms: number) => {
    setCurrentTimeMs(ms)
  }, [])

  // Auto-advance chunk based on playback position
  useEffect(() => {
    if (boundaries.length === 0 || showRating || isComplete) return
    const activeIdx = getActiveChunkIndex(boundaries, currentTimeMs)
    if (activeIdx !== prevChunkIndexRef.current) {
      prevChunkIndexRef.current = activeIdx
      setCurrentChunkIndex(activeIdx)
    }
    // Detect end of song: playback past last boundary
    if (
      boundaries.length > 0 &&
      currentTimeMs > 0 &&
      currentTimeMs >= boundaries[boundaries.length - 1].endMs - 500 &&
      !songEndedRef.current
    ) {
      songEndedRef.current = true
      setShowRating(true)
    }
  }, [currentTimeMs, boundaries, showRating, isComplete])

  // Current chunk
  const currentChunk = song?.chunks?.[currentChunkIndex] ?? null

  // Effective fade level: manual override > show full > unified level
  const effectiveFadeLevel =
    manualFadeOverride !== null
      ? manualFadeOverride
      : showFullLyrics ? 0 : currentFadeLevel

  // Resolve audio tracks based on mode
  const effectiveAudioTracks = useMemo((): AudioTrackData[] => {
    if (!song) return []
    const refs = song.referenceVocals ?? []

    if (audioMode === 'vocals_only') {
      // Find reference vocal matching user's voice part (or any)
      const match = refs.find((r) => r.voicePart === userVoicePart && r.isolatedFileUrl)
        ?? refs.find((r) => r.isolatedFileUrl)
      if (match?.isolatedFileUrl) {
        return [{
          id: `ref-vocal-${match.id}`,
          songId: song.id,
          voicePart: (match.voicePart as VoicePart) ?? 'full',
          fileUrl: match.isolatedFileUrl,
        }]
      }
    }

    if (audioMode === 'music_only') {
      // Find reference vocal with accompaniment
      const match = refs.find((r) => r.voicePart === userVoicePart && r.accompanimentFileUrl)
        ?? refs.find((r) => r.accompanimentFileUrl)
      if (match?.accompanimentFileUrl) {
        return [{
          id: `ref-acc-${match.id}`,
          songId: song.id,
          voicePart: 'playback' as VoicePart,
          fileUrl: match.accompanimentFileUrl,
        }]
      }
    }

    // Default: full mix
    return song.audioTracks ?? []
  }, [song, audioMode, userVoicePart])

  // Audio mode availability
  const audioModeAvailable = useMemo(() => {
    const refs = song?.referenceVocals ?? []
    return {
      fullMix: (song?.audioTracks?.length ?? 0) > 0,
      vocalsOnly: refs.some((r) => !!r.isolatedFileUrl),
      musicOnly: refs.some((r) => !!r.accompanimentFileUrl),
    }
  }, [song])

  // Available voice parts from reference vocals
  const availableVoiceParts = useMemo(() => {
    const refs = song?.referenceVocals ?? []
    const parts = [...new Set(refs.map((r) => r.voicePart))]
      .filter((p) => p in VOICE_PART_LABELS)
    return parts
  }, [song])

  // Handle end-of-song rating
  const handleRate = useCallback(
    async (rating: SelfRatingLabel) => {
      if (!song || isSubmitting) return
      setIsSubmitting(true)

      try {
        const chunkIds = song.chunks.map((c) => c.id)
        const res = await fetch('/api/practice/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunkIds,
            selfRating: rating,
            fadeLevel: currentFadeLevel,
          }),
        })

        if (res.ok) {
          const result = await res.json()
          if (result.xpEarned) setXpEarned(result.xpEarned)
        }
      } catch {
        // Non-critical
      }

      // Post practice session summary
      try {
        await fetch('/api/practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId,
            startedAt: sessionStartRef.current.toISOString(),
            completedAt: new Date().toISOString(),
            chunks: song.chunks.map((c) => ({ chunkId: c.id, ratings: [rating] })),
          }),
        })
      } catch {
        // Non-critical
      }

      setIsComplete(true)
      setIsSubmitting(false)
    },
    [song, currentFadeLevel, isSubmitting, songId],
  )

  // Skip to rating manually (e.g. if the song doesn't end automatically)
  const handleEndSong = useCallback(() => {
    audioActionsRef.current?.pause()
    setShowRating(true)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    if (!song || isComplete) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' || e.code === 'Space') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        const a = audioActionsRef.current
        if (a) a.isPlaying ? a.pause() : a.play()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setManualSeekMs(Math.max(0, currentTimeMs - 3000))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setManualSeekMs(currentTimeMs + 3000)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [song, isComplete, currentTimeMs])

  // Handle click on lyrics line to seek
  const handleLineSeek = useCallback((timestampMs: number) => {
    setManualSeekMs(timestampMs)
  }, [])

  const handleWordReveal = useCallback(() => {}, [])

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

  // -- End-of-song rating --
  if (showRating) {
    return (
      <div dir="rtl" className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] text-start gap-8 px-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{song.title}</h2>
          <p className="text-lg text-text-muted">איך היה הביצוע הכולל?</p>
        </div>

        <div className="w-full max-w-md">
          <SelfRatingButtons onRate={handleRate} disabled={isSubmitting} />
        </div>

        {isSubmitting && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            שומר...
          </div>
        )}
      </div>
    )
  }

  // -- Active practice (continuous karaoke) --
  return (
    <div dir="rtl" className="flex flex-col min-h-[calc(100dvh-8rem)] text-start">
      {/* Back to song page */}
      <button
        type="button"
        onClick={() => router.push(`/songs/${songId}`)}
        className="mb-2 flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors self-start"
      >
        <span className="text-base leading-none">{'\u2190'}</span>
        <span>{'חזרה לשיר'}</span>
      </button>

      {/* Top: Compact header + controls */}
      <div className="mb-3 shrink-0">
        <FadeLevelIndicator
          level={effectiveFadeLevel}
          songTitle={song.title}
          chunkLabel={currentChunk?.label ?? ''}
        />

        {/* Progress: chunk dots + label + end button */}
        <div className="mt-2 flex items-center gap-2 text-sm text-text-muted">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {song.chunks.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  if (boundaries[i]) {
                    setManualSeekMs(boundaries[i].startMs)
                  }
                  setCurrentChunkIndex(i)
                }}
                className={[
                  'h-2.5 shrink-0 rounded-full transition-all duration-300',
                  i === currentChunkIndex
                    ? 'w-6 bg-primary'
                    : i < currentChunkIndex
                      ? 'w-2.5 bg-primary/40'
                      : 'w-2.5 bg-border',
                ].join(' ')}
                title={c.label}
              />
            ))}
          </div>
          <span className="text-xs shrink-0">
            {currentChunk?.label}
          </span>
          <button
            type="button"
            onClick={handleEndSong}
            className="ms-auto shrink-0 text-xs text-primary hover:underline"
          >
            סיום ודירוג
          </button>
        </div>

        {/* Controls: all in one scrollable row on mobile */}
        <div className="mt-2 flex items-center gap-2 text-xs overflow-x-auto no-scrollbar pb-1">
          {/* Show full lyrics toggle */}
          <button
            type="button"
            onClick={() => {
              setShowFullLyrics((v) => !v)
              setManualFadeOverride(null)
            }}
            className={[
              'flex items-center gap-1 rounded-full px-2.5 py-1.5 transition-colors border shrink-0',
              showFullLyrics && manualFadeOverride === null
                ? 'bg-primary/15 border-primary text-primary'
                : 'bg-surface border-border text-text-muted hover:border-primary/50',
            ].join(' ')}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showFullLyrics ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' : 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18'} />
            </svg>
            <span className="hidden sm:inline">{showFullLyrics ? 'מילים מלאות' : 'הצג הכל'}</span>
          </button>

          {/* Fade level selector */}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 py-0.5 shrink-0">
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
                    'rounded-full transition-colors text-xs font-medium min-w-[28px] min-h-[28px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center',
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

          {/* Audio mode selector (inline) */}
          {(audioModeAvailable.vocalsOnly || audioModeAvailable.musicOnly) && (
            <AudioModeSelector
              available={audioModeAvailable}
              selected={audioMode}
              onChange={setAudioMode}
              className="shrink-0"
            />
          )}

          {/* Voice part selector */}
          {availableVoiceParts.length > 1 && (audioMode === 'vocals_only' || audioMode === 'music_only') && (
            <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 py-0.5 shrink-0">
              {availableVoiceParts.map((part) => {
                const isActive = userVoicePart === part
                return (
                  <button
                    key={part}
                    type="button"
                    onClick={() => setUserVoicePart(part)}
                    className={[
                      'rounded-full px-2.5 py-1.5 transition-colors text-xs font-medium whitespace-nowrap',
                      isActive
                        ? 'bg-primary text-white'
                        : 'text-text-muted hover:bg-surface-hover',
                    ].join(' ')}
                  >
                    {VOICE_PART_LABELS[part] ?? part}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Audio player */}
      <div className="mb-3 shrink-0">
        <AudioPlayer
          audioTracks={effectiveAudioTracks}
          youtubeVideoId={audioMode === 'full_mix' ? song.youtubeVideoId : undefined}
          spotifyTrackId={audioMode === 'full_mix' ? song.spotifyTrackId : undefined}
          onTimeUpdate={handleTimeUpdate}
          seekToMs={manualSeekMs}
          actionsRef={audioActionsRef}
        />
      </div>

      {/* Lyrics display — fills remaining space */}
      <div className="flex-1 min-h-0 rounded-xl border border-border bg-surface p-3 sm:p-6 mb-4 overflow-y-auto practice-scroll relative">
        {currentChunk && (
          <div
            key={currentChunk.id}
            className="animate-in fade-in duration-300"
          >
            {currentChunk.lineTimestamps ? (
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
            )}
          </div>
        )}
      </div>
    </div>
  )
}
