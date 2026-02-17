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
  EVERYONE,
  type WordTimestamp,
  type PlayerAssignment,
  type ChunkInfo,
} from '@/lib/karaoke-madness'
import type { AudioTrackData, VoicePart } from '@/lib/audio/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Chunk {
  id: string
  label: string
  lyrics: string
  chunkType: string
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
  language: string
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
  0: { he: 'בית בית', desc: 'כל בית — שחקן אחר. פזמון — כולם יחד!' },
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

/** Build ChunkInfo[] from chunks for verse-by-verse assignment. */
function buildChunkInfos(chunks: Chunk[]): ChunkInfo[] {
  return chunks
    .filter((c) => c.wordTimestamps && c.wordTimestamps.some((line) => line.length > 0))
    .map((c) => ({
      lineCount: c.wordTimestamps!.length,
      chunkType: c.chunkType || 'verse',
    }))
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

  // Setup state — restore from localStorage
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(() => {
    if (typeof window === 'undefined') return 2
    const saved = localStorage.getItem('km_playerCount')
    return saved ? (Number(saved) as 2 | 3 | 4) : 2
  })
  const [playerNames, setPlayerNames] = useState(() => {
    if (typeof window === 'undefined') return ['', '', '', '']
    try {
      const saved = localStorage.getItem('km_playerNames')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length === 4) return parsed as string[]
      }
    } catch { /* ignore */ }
    return ['', '', '', '']
  })
  const [difficulty, setDifficulty] = useState<0 | 1 | 2 | 3>(() => {
    if (typeof window === 'undefined') return 1
    const saved = localStorage.getItem('km_difficulty')
    const n = Number(saved)
    return (n >= 0 && n <= 3) ? (n as 0 | 1 | 2 | 3) : 1
  })
  const [audioMode, setAudioMode] = useState<'karaoke' | 'full'>(() => {
    if (typeof window === 'undefined') return 'karaoke'
    const saved = localStorage.getItem('km_audioMode')
    return saved === 'full' ? 'full' : 'karaoke'
  })

  // Persist setup state to localStorage
  useEffect(() => {
    localStorage.setItem('km_playerCount', String(playerCount))
    localStorage.setItem('km_playerNames', JSON.stringify(playerNames))
    localStorage.setItem('km_difficulty', String(difficulty))
    localStorage.setItem('km_audioMode', audioMode)
  }, [playerCount, playerNames, difficulty, audioMode])

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
    const tracks = song.audioTracks ?? []

    if (audioMode === 'karaoke') {
      // First check referenceVocals for accompaniment (from Demucs isolation)
      const refMatch = refs.find((r) => r.accompanimentFileUrl)
      if (refMatch?.accompanimentFileUrl) {
        return [{
          id: `karaoke-${refMatch.id}`,
          songId: song.id,
          voicePart: 'playback' as VoicePart,
          fileUrl: refMatch.accompanimentFileUrl,
        }]
      }
      // Then check audioTracks for a playback track (from YouTube stem separation)
      const playbackTrack = tracks.find((t) => t.voicePart === 'playback')
      if (playbackTrack) {
        return [playbackTrack]
      }
    }

    // Default: full mix — prefer 'full' track, fallback to all tracks
    const fullTrack = tracks.find((t) => t.voicePart === 'full')
    if (fullTrack) return [fullTrack]
    return tracks
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

  // Build chunk infos for verse-by-verse mode and chorus detection
  const chunkInfos = useMemo(() => song ? buildChunkInfos(song.chunks) : [], [song])

  // Start game (or re-generate with a new difficulty)
  function startWithDifficulty(d: 0 | 1 | 2 | 3) {
    if (!song) return
    const allWordTimestamps = mergeAllWordTimestamps(song.chunks)
    const result = generateAssignments(allWordTimestamps, playerCount, d, Date.now(), chunkInfos)
    setAssignment(result)
    setDifficulty(d)
    return result
  }

  function handleStart() {
    startWithDifficulty(difficulty)
    setPhase('countdown')
    setCountdown(3)
  }

  // Switch difficulty level mid-game
  function handleNextLevel() {
    const next = Math.min(difficulty + 1, 3) as 0 | 1 | 2 | 3
    if (next === difficulty) return
    startWithDifficulty(next)
  }

  function handlePrevLevel() {
    const prev = Math.max(difficulty - 1, 0) as 0 | 1 | 2 | 3
    if (prev === difficulty) return
    startWithDifficulty(prev)
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
            {([0, 1, 2, 3] as const).map((d) => (
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
              <div className={`h-4 w-4 rounded-full ${PLAYER_COLORS[i].bg}`} />
              <span className="text-sm font-medium text-foreground">{name}</span>
            </div>
          ))}
        </div>

        {/* Animated countdown number */}
        <div className="relative">
          <div
            key={countdown}
            className="text-9xl font-black text-primary"
            style={{
              animation: 'countdown-pop 0.9s ease-out',
              textShadow: `0 0 40px ${PLAYER_COLORS[0].hex}40, 0 0 80px ${PLAYER_COLORS[0].hex}20`,
            }}
          >
            {countdown > 0 ? countdown : '!'}
          </div>
          {/* Ripple ring */}
          <div
            key={`ring-${countdown}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ animation: 'countdown-ring 0.9s ease-out' }}
          >
            <div className="h-32 w-32 rounded-full border-4 border-primary/30" />
          </div>
        </div>

        <p className="mt-6 text-sm text-text-muted">
          {DIFFICULTY_LABELS[difficulty]?.he} &middot; {playerCount} {effectiveNames.length > 0 ? 'שחקנים' : ''}
        </p>

        <style>{`
          @keyframes countdown-pop {
            0% { transform: scale(0.3); opacity: 0; }
            40% { transform: scale(1.15); opacity: 1; }
            70% { transform: scale(0.95); }
            100% { transform: scale(1); opacity: 0.7; }
          }
          @keyframes countdown-ring {
            0% { transform: scale(0.5); opacity: 0.8; }
            100% { transform: scale(2.5); opacity: 0; }
          }
        `}</style>
      </div>
    )
  }

  // -- Playing phase (full-screen karaoke overlay) --
  if (phase === 'playing' && assignment) {
    return (
      <div dir="rtl" className="fixed inset-0 z-50 flex flex-col bg-black/95 text-center">
        {/* Top bar: players + controls */}
        <div className="shrink-0 px-4 pt-3 pb-2 bg-black/80 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            {effectiveNames.map((name, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`h-3.5 w-3.5 rounded-full ${PLAYER_COLORS[i].bg} shadow-sm`}
                  style={{ boxShadow: `0 0 8px ${PLAYER_COLORS[i].hex}60` }}
                />
                <span className="text-sm font-semibold text-white/90">{name}</span>
              </div>
            ))}
            <div className="ms-auto flex items-center gap-3">
              {/* Re-shuffle assignments */}
              <button
                type="button"
                onClick={() => startWithDifficulty(difficulty)}
                className="text-sm text-white/50 hover:text-white/80 transition-colors"
                title="חלוקה מחדש"
              >
                &#x1F3B2;
              </button>
              <span className="text-xs text-white/40">{DIFFICULTY_LABELS[difficulty]?.he}</span>
              <button
                type="button"
                onClick={() => {
                  audioActionsRef.current?.pause()
                  setPhase('ended')
                }}
                className="text-xs text-white/40 hover:text-white/70"
              >
                &#x2715;
              </button>
            </div>
          </div>

          {/* Audio player + vocals toggle side by side */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <AudioPlayer
                audioTracks={effectiveAudioTracks}
                youtubeVideoId={audioMode === 'full' ? song.youtubeVideoId : undefined}
                onTimeUpdate={handleTimeUpdate}
                actionsRef={audioActionsRef}
              />
            </div>
            {/* Big vocals toggle */}
            <button
              type="button"
              onClick={() => setAudioMode(audioMode === 'karaoke' ? 'full' : 'karaoke')}
              className={[
                'shrink-0 flex flex-col items-center gap-0.5 rounded-xl px-4 py-2 text-xs font-bold transition-all border-2',
                audioMode === 'karaoke'
                  ? 'border-purple-400/50 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'
                  : 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
              ].join(' ')}
            >
              <span className="text-lg leading-none">{audioMode === 'karaoke' ? '\u{1F3B5}' : '\u{1F3A4}'}</span>
              <span>{audioMode === 'karaoke' ? 'ליווי' : '+שירה'}</span>
            </button>
          </div>
        </div>

        {/* Lyrics — center of screen, scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
          <KaraokeMadnessDisplay
            lines={assignment.lines}
            playerNames={effectiveNames}
            currentTimeMs={currentTimeMs}
            language={song.language}
            onLineClick={(lineIdx) => {
              const line = assignment.lines[lineIdx]
              if (line?.words.length > 0) {
                audioActionsRef.current?.seekTo(line.words[0].startMs)
              }
            }}
          />
        </div>

        {/* Bottom bar: difficulty switch */}
        <div className="shrink-0 px-4 py-3 bg-black/80 backdrop-blur-sm border-t border-white/10 flex gap-2">
          {difficulty > 0 && (
            <button
              type="button"
              onClick={handlePrevLevel}
              className="flex-1 rounded-xl border-2 border-sky-400/30 bg-sky-500/10 px-4 py-3 text-base font-bold text-sky-300 transition-transform hover:scale-[1.02] active:scale-95"
            >
              &#x2744;&#xFE0F; {DIFFICULTY_LABELS[difficulty - 1]?.he}
            </button>
          )}
          {difficulty < 3 && (
            <button
              type="button"
              onClick={handleNextLevel}
              className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500 px-4 py-3 text-base font-black text-white shadow-lg shadow-purple-500/30 transition-transform hover:scale-[1.02] active:scale-95"
              style={{ animation: 'crazier-pulse 2s ease-in-out infinite' }}
            >
              &#x1F525; {DIFFICULTY_LABELS[difficulty + 1]?.he}
            </button>
          )}
          <style>{`
            @keyframes crazier-pulse {
              0%, 100% { box-shadow: 0 4px 20px rgba(168, 85, 247, 0.3); }
              50% { box-shadow: 0 4px 30px rgba(168, 85, 247, 0.5); }
            }
          `}</style>
        </div>
      </div>
    )
  }

  // -- End screen --
  if (phase === 'ended' && assignment && gameStats) {
    const totalWords = gameStats.wordCounts.reduce((a: number, b: number) => a + b, 0)
    // Find the player who sang the most
    const winnerIdx = gameStats.wordCounts.indexOf(Math.max(...gameStats.wordCounts))
    const winnerColor = PLAYER_COLORS[winnerIdx]

    return (
      <div dir="rtl" className="mx-auto max-w-lg space-y-6 text-start py-8">
        {/* Animated title */}
        <div className="text-center" style={{ animation: 'end-fade-in 0.6s ease-out' }}>
          <h1
            className="text-4xl font-black text-foreground"
            style={{ animation: 'end-bounce 0.8s ease-out' }}
          >
            &#127881; סיום! &#127881;
          </h1>
          <p className="text-lg text-text-muted mt-1">{song.title}</p>
        </div>

        {/* Winner spotlight */}
        <div style={{ animation: 'end-fade-in 0.8s ease-out 0.2s both' }}>
          <Card className="!p-5 text-center">
            <p className="text-sm text-text-muted mb-1">&#127942; הכי הרבה מילים</p>
            <p className="text-2xl font-black" style={{ color: winnerColor.hex }}>
              {gameStats.mostWords.name}
            </p>
            <p className="text-sm text-text-muted mt-1">
              {gameStats.mostWords.count} מילים
            </p>
          </Card>
        </div>

        {/* Per-player breakdown */}
        <div style={{ animation: 'end-fade-in 0.8s ease-out 0.4s both' }}>
        <Card className="!p-5 space-y-3">
          <h3 className="text-base font-semibold text-foreground text-center">&#128202; סטטיסטיקות</h3>
          <div className="space-y-3">
            {effectiveNames.map((name, i) => {
              const words = gameStats.wordCounts[i] || 0
              const durationSec = Math.round((gameStats.totalDurationMs[i] || 0) / 1000)
              const pct = totalWords > 0 ? Math.round((words / totalWords) * 100) : 0

              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`h-3.5 w-3.5 rounded-full shrink-0 ${PLAYER_COLORS[i].bg}`} />
                      <span className="font-medium text-foreground">{name}</span>
                    </div>
                    <span className="text-text-muted text-xs">
                      {words} מילים &middot; {durationSec}s
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface-hover overflow-hidden">
                    <div
                      className={`h-full rounded-full ${PLAYER_COLORS[i].bg}`}
                      style={{
                        width: `${pct}%`,
                        animation: `bar-grow 1s ease-out ${0.5 + i * 0.15}s both`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
        </div>

        {/* Actions */}
        <div
          className="flex gap-3"
          style={{ animation: 'end-fade-in 0.8s ease-out 0.6s both' }}
        >
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              setPhase('setup')
              setAssignment(null)
              setCurrentTimeMs(0)
            }}
          >
            &#128260; שחקו שוב
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setPhase('setup')
              setAssignment(null)
              setCurrentTimeMs(0)
            }}
          >
            &#9881;&#65039; שנו הגדרות
          </Button>
        </div>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => router.push('/songs')}
        >
          &#127925; בחרו שיר אחר
        </Button>

        <style>{`
          @keyframes end-fade-in {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes end-bounce {
            0% { transform: scale(0.5); opacity: 0; }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes bar-grow {
            from { width: 0%; }
          }
        `}</style>
      </div>
    )
  }

  return null
}
