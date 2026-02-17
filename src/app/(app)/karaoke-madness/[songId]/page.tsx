'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import AudioPlayer from '@/components/audio/AudioPlayer'
import type { AudioActions } from '@/components/audio/AudioPlayer'
import KaraokeMadnessDisplay from '@/components/karaoke-madness/KaraokeMadnessDisplay'
import {
  generateAssignments,
  computeGameStats,
  PLAYER_COLORS,
  type WordTimestamp,
  type PlayerAssignment,
} from '@/lib/karaoke-madness'
import type { AudioTrackData, VoicePart } from '@/lib/audio/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Chunk {
  id: string
  label: string
  lyrics: string
  lineTimestamps: number[] | null
  wordTimestamps: WordTimestamp[][] | null
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
  audioTracks?: AudioTrackData[]
  referenceVocals?: ReferenceVocal[]
  youtubeVideoId?: string | null
}

type GamePhase = 'setup' | 'countdown' | 'playing' | 'ended'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIFFICULTY_LABELS: Record<number, { he: string; desc: string }> = {
  1: { he: 'שורה שורה', desc: 'כל שורה — שחקן אחר' },
  2: { he: 'ביטויים', desc: 'כל ביטוי של 2-3 מילים — שחקן אחר' },
  3: { he: 'מילה מילה', desc: 'כל מילה — שחקן אחר. טירוף!' },
}

/** Merge all chunks' word timestamps into a flat array of lines. */
function mergeAllWordTimestamps(chunks: Chunk[]): WordTimestamp[][] {
  const allLines: WordTimestamp[][] = []
  for (const chunk of chunks) {
    if (chunk.wordTimestamps) {
      allLines.push(...chunk.wordTimestamps)
    }
  }
  return allLines
}

/** Check if song has word timestamps. */
function hasWordTimestamps(chunks: Chunk[]): boolean {
  return chunks.some((c) => c.wordTimestamps && c.wordTimestamps.some((line) => line.length > 0))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KaraokeMadnessPage() {
  const params = useParams<{ songId: string }>()
  const router = useRouter()
  const songId = params.songId

  // Data
  const [song, setSong] = useState<SongData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Setup state
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2)
  const [playerNames, setPlayerNames] = useState(['', '', '', ''])
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1)
  const [audioMode, setAudioMode] = useState<'karaoke' | 'full'>('karaoke')

  // Game state
  const [phase, setPhase] = useState<GamePhase>('setup')
  const [countdown, setCountdown] = useState(3)
  const [assignment, setAssignment] = useState<PlayerAssignment | null>(null)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [syncing, setSyncing] = useState(false)

  // Audio
  const audioActionsRef = useRef<AudioActions | null>(null)

  // Fetch song data
  useEffect(() => {
    async function fetchSong() {
      try {
        setLoading(true)
        const res = await fetch(`/api/songs/${songId}`)
        if (!res.ok) throw new Error('Failed to fetch song')
        const data = await res.json()
        const raw = data.song ?? data

        const songData: SongData = {
          ...raw,
          chunks: (raw.chunks || []).map((c: any) => ({
            ...c,
            lineTimestamps: c.lineTimestamps ? JSON.parse(c.lineTimestamps) : null,
            wordTimestamps: c.wordTimestamps ? JSON.parse(c.wordTimestamps) : null,
          })),
        }
        setSong(songData)
        document.title = `${songData.title} - קריוקי מטורף`
      } catch (err) {
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת השיר')
      } finally {
        setLoading(false)
      }
    }
    fetchSong()
  }, [songId])

  // Resolve audio tracks based on mode
  const effectiveAudioTracks = useMemo((): AudioTrackData[] => {
    if (!song) return []
    const refs = song.referenceVocals ?? []

    if (audioMode === 'karaoke') {
      // Find accompaniment track (instrumental / karaoke)
      const match = refs.find((r) => r.accompanimentFileUrl)
      if (match?.accompanimentFileUrl) {
        return [{
          id: `karaoke-${match.id}`,
          songId: song.id,
          voicePart: 'playback' as VoicePart,
          fileUrl: match.accompanimentFileUrl,
        }]
      }
    }

    // Default: full mix
    return song.audioTracks ?? []
  }, [song, audioMode])

  const handleTimeUpdate = useCallback((ms: number) => {
    setCurrentTimeMs(ms)
  }, [])

  // Auto-sync handler
  async function handleAutoSync() {
    if (!song?.audioTracks?.length) return
    setSyncing(true)
    try {
      const trackId = song.audioTracks[0].id
      const res = await fetch(`/api/songs/${songId}/auto-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioTrackId: trackId }),
      })
      if (res.ok) {
        // Reload song to get new timestamps
        const songRes = await fetch(`/api/songs/${songId}`)
        if (songRes.ok) {
          const data = await songRes.json()
          const raw = data.song ?? data
          setSong({
            ...raw,
            chunks: (raw.chunks || []).map((c: any) => ({
              ...c,
              lineTimestamps: c.lineTimestamps ? JSON.parse(c.lineTimestamps) : null,
              wordTimestamps: c.wordTimestamps ? JSON.parse(c.wordTimestamps) : null,
            })),
          })
        }
      }
    } catch { /* non-critical */ }
    setSyncing(false)
  }

  // Start game
  function handleStart() {
    if (!song) return
    const allWordTimestamps = mergeAllWordTimestamps(song.chunks)
    const result = generateAssignments(allWordTimestamps, playerCount, difficulty)
    setAssignment(result)
    setPhase('countdown')
    setCountdown(3)
  }

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('playing')
      audioActionsRef.current?.play()
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [phase, countdown])

  // Detect end of song
  useEffect(() => {
    if (phase !== 'playing' || !assignment) return
    // Find the last word's end time
    const allWords = assignment.lines.flatMap((l) => l.words)
    if (allWords.length === 0) return
    const lastEndMs = Math.max(...allWords.map((w) => w.endMs))
    if (currentTimeMs > 0 && currentTimeMs >= lastEndMs + 2000) {
      setPhase('ended')
      audioActionsRef.current?.pause()
    }
  }, [phase, assignment, currentTimeMs])

  // Effective player names
  const effectiveNames = playerNames
    .slice(0, playerCount)
    .map((n, i) => n.trim() || `שחקן ${i + 1}`)

  // Game stats for end screen
  const gameStats = useMemo(() => {
    if (!assignment) return null
    return computeGameStats(assignment, effectiveNames)
  }, [assignment, effectiveNames])

  // -- Loading --
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-text-muted">טוען...</p>
        </div>
      </div>
    )
  }

  // -- Error --
  if (error || !song) {
    return (
      <div dir="rtl" className="py-12 text-center text-start">
        <p className="text-danger mb-4">{error ?? 'השיר לא נמצא'}</p>
        <Button variant="outline" onClick={() => router.push('/songs')}>חזרה לשירים</Button>
      </div>
    )
  }

  const hasSyncedWords = hasWordTimestamps(song.chunks)

  // -- Setup phase --
  if (phase === 'setup') {
    return (
      <div dir="rtl" className="mx-auto max-w-lg space-y-6 text-start">
        <div>
          <button
            type="button"
            onClick={() => router.push(`/songs/${songId}`)}
            className="mb-2 flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors"
          >
            <span className="text-base leading-none">{'\u2190'}</span>
            <span>חזרה לשיר</span>
          </button>
          <h1 className="text-2xl font-bold text-foreground">קריוקי מטורף</h1>
          <p className="text-sm text-text-muted mt-1">{song.title}</p>
        </div>

        {!hasSyncedWords && (
          <Card className="!p-4 border-amber-500/30 bg-amber-500/5">
            <p className="text-sm text-foreground font-medium">לשיר הזה אין תזמון מילים</p>
            <p className="text-xs text-text-muted mt-1">יש לסנכרן מילים לפני שאפשר לשחק</p>
            {song.audioTracks && song.audioTracks.length > 0 ? (
              <Button
                variant="primary"
                size="sm"
                className="mt-3"
                loading={syncing}
                onClick={handleAutoSync}
              >
                סנכרן אוטומטית
              </Button>
            ) : (
              <p className="text-xs text-text-muted mt-2">אין קובץ שמע — יש להעלות שמע ואז לסנכרן</p>
            )}
          </Card>
        )}

        {/* Player count */}
        <Card className="!p-4 space-y-3">
          <label className="block text-sm font-medium text-foreground">מספר שחקנים</label>
          <div className="flex gap-2">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPlayerCount(n)}
                className={[
                  'flex-1 rounded-lg border-2 py-3 text-lg font-bold transition-colors',
                  playerCount === n
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-text-muted hover:border-primary/50',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
          </div>
        </Card>

        {/* Player names */}
        <Card className="!p-4 space-y-3">
          <label className="block text-sm font-medium text-foreground">שמות שחקנים</label>
          <div className="space-y-2">
            {Array.from({ length: playerCount }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded-full shrink-0 ${PLAYER_COLORS[i].bg}`}
                />
                <input
                  type="text"
                  placeholder={`שחקן ${i + 1}`}
                  value={playerNames[i]}
                  onChange={(e) => {
                    const next = [...playerNames]
                    next[i] = e.target.value
                    setPlayerNames(next)
                  }}
                  dir="rtl"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-text-muted"
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Difficulty */}
        <Card className="!p-4 space-y-3">
          <label className="block text-sm font-medium text-foreground">רמת קושי</label>
          <div className="space-y-2">
            {([1, 2, 3] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={[
                  'w-full text-start rounded-lg border-2 px-4 py-3 transition-colors',
                  difficulty === d
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-surface hover:border-primary/50',
                ].join(' ')}
              >
                <p className={[
                  'text-sm font-medium',
                  difficulty === d ? 'text-primary' : 'text-foreground',
                ].join(' ')}>
                  {DIFFICULTY_LABELS[d].he}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {DIFFICULTY_LABELS[d].desc}
                </p>
              </button>
            ))}
          </div>
        </Card>

        {/* Audio mode */}
        <Card className="!p-4 space-y-3">
          <label className="block text-sm font-medium text-foreground">מצב שמע</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAudioMode('karaoke')}
              className={[
                'flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors',
                audioMode === 'karaoke'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-text-muted hover:border-primary/50',
              ].join(' ')}
            >
              קריוקי (ליווי בלבד)
            </button>
            <button
              type="button"
              onClick={() => setAudioMode('full')}
              className={[
                'flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors',
                audioMode === 'full'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-text-muted hover:border-primary/50',
              ].join(' ')}
            >
              מלא (עם שירה)
            </button>
          </div>
        </Card>

        {/* Start button */}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!hasSyncedWords}
          onClick={handleStart}
        >
          התחילו!
        </Button>
      </div>
    )
  }

  // -- Countdown phase --
  if (phase === 'countdown') {
    return (
      <div dir="rtl" className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] text-start">
        <h2 className="text-lg text-text-muted mb-4">{song.title}</h2>

        {/* Player bar */}
        <div className="flex gap-3 mb-8">
          {effectiveNames.map((name, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`h-3 w-3 rounded-full ${PLAYER_COLORS[i].bg}`} />
              <span className="text-sm text-foreground">{name}</span>
            </div>
          ))}
        </div>

        <div className="text-8xl font-black text-primary animate-pulse">
          {countdown > 0 ? countdown : '!'}
        </div>
      </div>
    )
  }

  // -- Playing phase --
  if (phase === 'playing' && assignment) {
    return (
      <div dir="rtl" className="flex flex-col min-h-[calc(100dvh-8rem)] text-start">
        {/* Player bar */}
        <div className="flex items-center gap-3 mb-3 shrink-0">
          {effectiveNames.map((name, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`h-3 w-3 rounded-full ${PLAYER_COLORS[i].bg}`} />
              <span className="text-sm font-medium text-foreground">{name}</span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              audioActionsRef.current?.pause()
              setPhase('ended')
            }}
            className="ms-auto text-xs text-text-muted hover:text-foreground"
          >
            סיום
          </button>
        </div>

        {/* Audio player */}
        <div className="mb-3 shrink-0">
          <AudioPlayer
            audioTracks={effectiveAudioTracks}
            youtubeVideoId={audioMode === 'full' ? song.youtubeVideoId : undefined}
            onTimeUpdate={handleTimeUpdate}
            actionsRef={audioActionsRef}
          />
        </div>

        {/* Lyrics display */}
        <div className="flex-1 min-h-0 rounded-xl border border-border bg-surface p-3 sm:p-6 mb-4 overflow-y-auto">
          <KaraokeMadnessDisplay
            lines={assignment.lines}
            playerNames={effectiveNames}
            currentTimeMs={currentTimeMs}
          />
        </div>
      </div>
    )
  }

  // -- End screen --
  if (phase === 'ended' && assignment && gameStats) {
    return (
      <div dir="rtl" className="mx-auto max-w-lg space-y-6 text-start py-8">
        <div className="text-center">
          <h1 className="text-3xl font-black text-foreground">סיום!</h1>
          <p className="text-lg text-text-muted mt-1">{song.title}</p>
        </div>

        {/* Fun stats */}
        <Card className="!p-5 space-y-4">
          <h3 className="text-base font-semibold text-foreground text-center">סטטיסטיקות</h3>

          {/* Most words */}
          <div className="text-center">
            <p className="text-sm text-text-muted">הכי הרבה מילים:</p>
            <p className="text-xl font-bold text-primary">
              {gameStats.mostWords.name} ({gameStats.mostWords.count} מילים)
            </p>
          </div>

          {/* Per-player breakdown */}
          <div className="space-y-2">
            {effectiveNames.map((name, i) => {
              const words = gameStats.wordCounts[i] || 0
              const durationSec = Math.round((gameStats.totalDurationMs[i] || 0) / 1000)
              const totalWords = gameStats.wordCounts.reduce((a: number, b: number) => a + b, 0)
              const pct = totalWords > 0 ? Math.round((words / totalWords) * 100) : 0

              return (
                <div key={i} className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full shrink-0 ${PLAYER_COLORS[i].bg}`} />
                  <span className="text-sm font-medium text-foreground w-20 truncate">{name}</span>
                  <div className="flex-1 h-3 rounded-full bg-surface-hover overflow-hidden">
                    <div
                      className={`h-full rounded-full ${PLAYER_COLORS[i].bg} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-muted shrink-0">
                    {words} ({durationSec}s)
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              setPhase('setup')
              setAssignment(null)
              setCurrentTimeMs(0)
            }}
          >
            שחקו שוב
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setPhase('setup')
              setAssignment(null)
              setCurrentTimeMs(0)
              setPlayerNames(['', '', '', ''])
              setDifficulty(1)
            }}
          >
            שנו הגדרות
          </Button>
        </div>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => router.push('/songs')}
        >
          בחרו שיר אחר
        </Button>
      </div>
    )
  }

  return null
}
