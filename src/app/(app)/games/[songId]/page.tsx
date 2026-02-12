'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Card from '@/components/ui/Card'
import GameSelector from '@/components/games/GameSelector'
import WordScramble from '@/components/games/WordScramble'
import FillTheBlank from '@/components/games/FillTheBlank'
import FinishTheLine from '@/components/games/FinishTheLine'
import AudioPlayer from '@/components/audio/AudioPlayer'
import KaraokeDisplay from '@/components/practice/KaraokeDisplay'
import { calculateGameXP } from '@/lib/game-utils'
import type { AudioTrackData } from '@/lib/audio/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Chunk {
  id: string
  label: string
  lyrics: string
  order: number
  lineTimestamps: number[] | null
}

interface Song {
  id: string
  title: string
  chunks: Chunk[]
  spotifyTrackId?: string | null
  youtubeVideoId?: string | null
  audioTracks?: AudioTrackData[]
}

interface ChunkProgress {
  chunkId: string
  status: string
  fadeLevel: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GamesPage() {
  const params = useParams<{ songId: string }>()
  const songId = params.songId

  // State
  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedChunkId, setSelectedChunkId] = useState<string>('')
  const [chunkStatuses, setChunkStatuses] = useState<Record<string, string>>({})

  const [activeGame, setActiveGame] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy')

  const [gameResult, setGameResult] = useState<{
    score: number
    xpEarned: number
  } | null>(null)
  const [submittingScore, setSubmittingScore] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)

  // -----------------------------------------------------------------------
  // Fetch song data + audio tracks
  // -----------------------------------------------------------------------

  useEffect(() => {
    async function fetchSong() {
      try {
        setLoading(true)
        const [songRes, audioRes] = await Promise.all([
          fetch(`/api/songs/${songId}`),
          fetch(`/api/songs/${songId}/audio-tracks`),
        ])
        if (!songRes.ok) {
          const data = await songRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to fetch song')
        }
        const { song: raw } = await songRes.json()

        let audioTracks: AudioTrackData[] = []
        if (audioRes.ok) {
          const audioJson = await audioRes.json()
          audioTracks = audioJson.audioTracks ?? []
        }

        const songData = {
          ...raw,
          audioTracks,
          chunks: (raw.chunks || []).map((c: any) => ({
            ...c,
            lineTimestamps: c.lineTimestamps ? JSON.parse(c.lineTimestamps) : null,
          })),
        }
        setSong(songData)

        // Auto-select first chunk
        if (songData.chunks?.length > 0) {
          setSelectedChunkId(songData.chunks[0].id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch song')
      } finally {
        setLoading(false)
      }
    }

    if (songId) fetchSong()
  }, [songId])

  // -----------------------------------------------------------------------
  // Fetch chunk progress / statuses
  // -----------------------------------------------------------------------

  useEffect(() => {
    async function fetchProgress() {
      try {
        const res = await fetch(`/api/practice?songId=${songId}`)
        if (res.ok) {
          const data = await res.json()
          const statusMap: Record<string, string> = {}
          if (Array.isArray(data.progress)) {
            data.progress.forEach((p: ChunkProgress) => {
              statusMap[p.chunkId] = p.status || 'fragile'
            })
          }
          setChunkStatuses(statusMap)
        }
      } catch {
        // Silently fail — statuses default to "fragile"
      }
    }

    if (songId) fetchProgress()
  }, [songId])

  // -----------------------------------------------------------------------
  // Game selection
  // -----------------------------------------------------------------------

  const handleSelectGame = (gameId: string) => {
    setActiveGame(gameId)
    setGameResult(null)
  }

  // -----------------------------------------------------------------------
  // Game completion
  // -----------------------------------------------------------------------

  const handleGameComplete = useCallback(
    async (score: number) => {
      // Calculate XP based on game type
      let maxScore = 100
      if (activeGame === 'fill-the-blank') {
        const chunk = song?.chunks.find((c) => c.id === selectedChunkId)
        if (chunk) {
          const lineCount = chunk.lyrics
            .split('\n')
            .filter((l) => l.trim()).length
          maxScore = lineCount * 10
        }
      }

      const xpEarned = calculateGameXP(score, maxScore)
      setGameResult({ score, xpEarned })

      // POST to API to record the practice
      try {
        setSubmittingScore(true)
        // Map game score to a self-rating for the SR system
        const ratio = maxScore > 0 ? score / maxScore : 0
        let selfRating: string
        if (ratio >= 0.8) selfRating = 'nailed_it'
        else if (ratio >= 0.5) selfRating = 'almost'
        else selfRating = 'struggling'

        await fetch('/api/practice/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunkId: selectedChunkId,
            selfRating,
          }),
        })
      } catch {
        // Silently fail — game score is still shown
      } finally {
        setSubmittingScore(false)
      }
    },
    [activeGame, selectedChunkId, song],
  )

  // -----------------------------------------------------------------------
  // Current chunk info
  // -----------------------------------------------------------------------

  const selectedChunk = song?.chunks.find((c) => c.id === selectedChunkId)
  const chunkStatus = chunkStatuses[selectedChunkId] || 'fragile'

  // -----------------------------------------------------------------------
  // Loading / Error states
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-text-muted">טוען שיר...</p>
        </div>
      </div>
    )
  }

  if (error || !song) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-4xl" aria-hidden="true">
              &#128533;
            </div>
            <p className="text-foreground font-medium">
              {error || 'השיר לא נמצא'}
            </p>
            <Button
              variant="outline"
              onClick={() => window.history.back()}
            >
              חזרה
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!song.chunks || song.chunks.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-4xl" aria-hidden="true">
              &#128196;
            </div>
            <p className="text-foreground font-medium">
              אין קטעים לשיר הזה
            </p>
            <p className="text-sm text-text-muted">
              הוסיפו מילים לשיר כדי להתחיל לתרגל
            </p>
            <Button
              variant="outline"
              onClick={() => window.history.back()}
            >
              חזרה
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Game result screen
  // -----------------------------------------------------------------------

  if (gameResult) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <Card>
          <div className="flex flex-col items-center gap-6 py-4 text-center">
            <div className="text-5xl" aria-hidden="true">
              &#127881;
            </div>
            <h2 className="text-2xl font-bold text-foreground">כל הכבוד!</h2>

            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-primary">
                  {gameResult.score}
                </span>
                <span className="text-sm text-text-muted">ניקוד</span>
              </div>
              <div className="h-10 w-px bg-border" />
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-secondary">
                  +{gameResult.xpEarned}
                </span>
                <span className="text-sm text-text-muted">XP</span>
              </div>
            </div>

            {submittingScore && (
              <p className="text-sm text-text-muted">שומר ניקוד...</p>
            )}

            <div className="flex flex-wrap justify-center gap-3">
              <Button
                variant="primary"
                onClick={() => {
                  setGameResult(null)
                  setActiveGame(null)
                }}
              >
                החלפת משחק
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setGameResult(null)
                  // Replay the same game
                }}
              >
                שחקו שוב
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Active game
  // -----------------------------------------------------------------------

  if (activeGame && selectedChunk) {
    return (
      <div className="mx-auto max-w-2xl py-4">
        {/* Back button */}
        <button
          type="button"
          onClick={() => setActiveGame(null)}
          className="mb-4 flex items-center gap-1 text-sm text-text-muted hover:text-foreground transition-colors"
        >
          <svg
            className="h-4 w-4 rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          חזרה למשחקים
        </button>
        <a
          href={`/songs/${songId}/edit`}
          className="mb-4 inline-block text-xs text-primary hover:underline"
        >
          עריכה
        </a>

        {/* Audio player during game */}
        <div className="mb-4">
          <AudioPlayer
            audioTracks={song.audioTracks ?? []}
            youtubeVideoId={song.youtubeVideoId}
            spotifyTrackId={song.spotifyTrackId}
            onTimeUpdate={setCurrentTimeMs}
          />
        </div>

        {/* Render game — no lyrics display; games test recall from memory */}
        {activeGame === 'word-scramble' && (
          <WordScramble
            lyrics={selectedChunk.lyrics}
            chunkLabel={selectedChunk.label}
            onComplete={handleGameComplete}
          />
        )}

        {activeGame === 'fill-the-blank' && (
          <FillTheBlank
            lyrics={selectedChunk.lyrics}
            chunkLabel={selectedChunk.label}
            difficulty={difficulty}
            onComplete={handleGameComplete}
          />
        )}

        {activeGame === 'finish-the-line' && (
          <FinishTheLine
            lyrics={selectedChunk.lyrics}
            chunkLabel={selectedChunk.label}
            onComplete={handleGameComplete}
          />
        )}
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Main: Chunk selector + GameSelector
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl py-4">
      {/* Song title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{song.title}</h1>
        <p className="text-sm text-text-muted">משחקי שינון</p>
      </div>

      {/* Audio player */}
      <div className="mb-6">
        <AudioPlayer
          audioTracks={song.audioTracks ?? []}
          youtubeVideoId={song.youtubeVideoId}
          spotifyTrackId={song.spotifyTrackId}
          onTimeUpdate={setCurrentTimeMs}
        />
      </div>

      {/* Chunk selector */}
      <div className="mb-6">
        <Select
          label="בחרו קטע"
          options={song.chunks.map((c) => ({
            value: c.id,
            label: c.label || `קטע ${c.order + 1}`,
          }))}
          value={selectedChunkId}
          onChange={(e) => {
            setSelectedChunkId(e.target.value)
            setActiveGame(null)
            setCurrentTimeMs(0)
          }}
        />
      </div>

      {/* Difficulty selector (only shown when relevant) */}
      {chunkStatus !== 'fragile' && (
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              רמת קושי:
            </span>
            <div className="flex gap-2">
              {(['easy', 'medium', 'hard'] as const).map((d) => {
                const labels: Record<string, string> = {
                  easy: 'קל',
                  medium: 'בינוני',
                  hard: 'קשה',
                }
                const isSelected = difficulty === d
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={[
                      'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                      isSelected
                        ? 'bg-primary text-white'
                        : 'bg-border/40 text-text-muted hover:bg-border hover:text-foreground',
                    ].join(' ')}
                  >
                    {labels[d]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Game selector */}
      {selectedChunk && (
        <GameSelector
          chunkStatus={chunkStatus}
          songTitle={song.title}
          onSelectGame={handleSelectGame}
        />
      )}
    </div>
  )
}
