'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import YouTubePlayer, { type YouTubePlayerHandle } from '@/components/youtube/YouTubePlayer'
import Button from '@/components/ui/Button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AudioTrack {
  id: string
  voicePart: string
  fileUrl: string
}

interface LyricsSyncToolProps {
  videoId?: string | null
  audioTracks?: AudioTrack[]
  lyrics: string
  chunkId: string
  songId: string
  existingTimestamps?: number[] | null
  /** Start time in ms — e.g. last timestamp of the previous chunk so the user doesn't re-listen from the beginning. */
  startTimeMs?: number
  onSaved: (timestamps: number[]) => void
  /** If provided, shows a "Save & Next" button in the done state. */
  onSavedAndNext?: (timestamps: number[]) => void
  onClose: () => void
}

/** Unified player interface for both YouTube and HTML audio */
interface PlayerHandle {
  play(): void
  pause(): void
  seekTo(seconds: number): void
  getCurrentTime(): number
}

type SyncState = 'idle' | 'syncing' | 'done'

const VOICE_PART_LABELS: Record<string, string> = {
  soprano: 'סופרן',
  mezzo: 'מצו-סופרן',
  alto: 'אלט',
  tenor: 'טנור',
  baritone: 'בריטון',
  bass: 'בס',
  mix: 'מיקס',
  playback: 'פלייבק',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LyricsSyncTool({
  videoId,
  audioTracks,
  lyrics,
  chunkId,
  songId,
  existingTimestamps,
  startTimeMs = 0,
  onSaved,
  onSavedAndNext,
  onClose,
}: LyricsSyncToolProps) {
  const ytPlayerRef = useRef<YouTubePlayerHandle>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const linesContainerRef = useRef<HTMLDivElement>(null)

  // Determine audio source mode
  const hasYoutube = !!videoId
  const voiceTracks = (audioTracks ?? []).filter((t) =>
    ['soprano', 'mezzo', 'alto', 'tenor', 'baritone', 'bass', 'mix', 'playback'].includes(t.voicePart)
  )
  const hasAudioTracks = voiceTracks.length > 0
  const useAudioTrack = !hasYoutube && hasAudioTracks

  const [selectedTrackId, setSelectedTrackId] = useState<string>(voiceTracks[0]?.id ?? '')
  const selectedTrack = voiceTracks.find((t) => t.id === selectedTrackId)

  // Unified player handle
  const getPlayer = useCallback((): PlayerHandle | null => {
    if (useAudioTrack) {
      const audio = audioRef.current
      if (!audio) return null
      return {
        play() { audio.play() },
        pause() { audio.pause() },
        seekTo(seconds: number) { audio.currentTime = seconds },
        getCurrentTime() { return audio.currentTime },
      }
    } else {
      const yt = ytPlayerRef.current
      if (!yt) return null
      return yt
    }
  }, [useAudioTrack])

  // Parse non-empty lines
  const lines = lyrics.split('\n').filter((l) => l.trim())

  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [timestamps, setTimestamps] = useState<number[]>(existingTimestamps ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset all state when switching to a different chunk (e.g. "Save & Next")
  const prevChunkIdRef = useRef(chunkId)
  useEffect(() => {
    if (prevChunkIdRef.current !== chunkId) {
      prevChunkIdRef.current = chunkId
      setTimestamps(existingTimestamps ?? [])
      setCurrentLineIndex(0)
      setError(null)
      setSaving(false)

      if (startTimeMs > 0) {
        // Auto-start syncing: the player is already playing from the previous chunk,
        // so continue seamlessly without pausing or seeking
        setSyncState('syncing')
      } else {
        setSyncState('idle')
        setTimeout(() => {
          const player = getPlayer()
          if (player) {
            player.seekTo(0)
          }
        }, 100)
      }
    }
  }, [chunkId, existingTimestamps, getPlayer, startTimeMs])

  // Mark the current line's timestamp
  const markLine = useCallback(() => {
    if (syncState !== 'syncing') return
    const player = getPlayer()
    if (!player) return

    const timeMs = Math.round(player.getCurrentTime() * 1000)
    setTimestamps((prev) => {
      const updated = [...prev]
      updated[currentLineIndex] = timeMs
      return updated
    })

    if (currentLineIndex + 1 >= lines.length) {
      setSyncState('done')
    } else {
      setCurrentLineIndex((i) => i + 1)
    }
  }, [syncState, currentLineIndex, lines.length, getPlayer])

  // Go back to a previous line to re-mark it
  const goBackToLine = useCallback((targetIndex: number) => {
    if (syncState === 'done') {
      setSyncState('syncing')
    }
    if (syncState !== 'syncing' && syncState !== 'done') return
    if (targetIndex < 0) return
    setCurrentLineIndex(targetIndex)
    // Seek audio to slightly before that line's timestamp (if it was already marked)
    const player = getPlayer()
    if (player && timestamps[targetIndex] !== undefined) {
      const seekTo = Math.max(0, timestamps[targetIndex] / 1000 - 1)
      player.seekTo(seekTo)
    }
  }, [syncState, getPlayer, timestamps])

  // Keyboard shortcuts: Space/Enter to mark, Left/Right to seek ±3s, Backspace to go back
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (syncState !== 'syncing') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        markLine()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        if (currentLineIndex > 0) {
          goBackToLine(currentLineIndex - 1)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        if (currentLineIndex > 0) {
          goBackToLine(currentLineIndex - 1)
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        if (currentLineIndex < lines.length - 1 && currentLineIndex < timestamps.length) {
          setCurrentLineIndex((i) => i + 1)
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        const player = getPlayer()
        if (!player) return
        const cur = player.getCurrentTime()
        const delta = e.key === 'ArrowRight' ? 3 : -3
        player.seekTo(Math.max(0, cur + delta))
      }
    }
    // Use capture phase to beat the YouTube player's event handlers
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [syncState, markLine, getPlayer, goBackToLine, currentLineIndex, lines.length, timestamps.length])

  // Auto-scroll current line into view
  useEffect(() => {
    if (syncState !== 'syncing') return
    const container = linesContainerRef.current
    if (!container) return
    const lineEl = container.children[currentLineIndex] as HTMLElement | undefined
    lineEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentLineIndex, syncState])

  const startTimeSec = startTimeMs / 1000

  function handleStartSyncing() {
    setTimestamps([])
    setCurrentLineIndex(0)
    setSyncState('syncing')
    const player = getPlayer()
    player?.seekTo(startTimeSec)
    player?.play()
  }

  function handleRedo() {
    setTimestamps([])
    setCurrentLineIndex(0)
    setSyncState('idle')
    const player = getPlayer()
    player?.pause()
    player?.seekTo(startTimeSec)
  }

  async function saveTimestamps(): Promise<boolean> {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/songs/${songId}/chunks/${chunkId}/timestamps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamps }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'שגיאה בשמירה')
      }
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const ok = await saveTimestamps()
    if (ok) onSaved(timestamps)
  }

  async function handleSaveAndNext() {
    const ok = await saveTimestamps()
    if (ok) onSavedAndNext?.(timestamps)
  }

  function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    const frac = Math.floor((ms % 1000) / 100)
    return `${min}:${sec.toString().padStart(2, '0')}.${frac}`
  }

  return (
    <div className="space-y-4">
      {/* Audio source */}
      {useAudioTrack ? (
        <div className="space-y-3">
          {/* Voice part selector */}
          {voiceTracks.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-foreground">קול לסנכרון:</label>
              <select
                value={selectedTrackId}
                onChange={(e) => setSelectedTrackId(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
              >
                {voiceTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {VOICE_PART_LABELS[track.voicePart] ?? track.voicePart}
                  </option>
                ))}
              </select>
            </div>
          )}
          {voiceTracks.length === 1 && (
            <p className="text-sm text-text-muted">
              סנכרון לפי: <span className="font-medium text-foreground">{VOICE_PART_LABELS[voiceTracks[0].voicePart] ?? voiceTracks[0].voicePart}</span>
            </p>
          )}
          {/* HTML Audio player */}
          {selectedTrack && (
            <audio
              ref={audioRef}
              key={selectedTrack.id}
              src={selectedTrack.fileUrl}
              controls
              preload="auto"
              tabIndex={-1}
              className="w-full rounded-lg"
            />
          )}
        </div>
      ) : hasYoutube ? (
        <YouTubePlayer
          ref={ytPlayerRef}
          videoId={videoId!}
          enableTimeTracking={false}
        />
      ) : null}

      {/* Lyrics lines */}
      <div
        ref={linesContainerRef}
        className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-3 space-y-1"
        dir="auto"
      >
        {lines.map((line, idx) => {
          const isActive = syncState === 'syncing' && idx === currentLineIndex
          const isMarked = idx < timestamps.length
          const isPast = (syncState === 'syncing' && idx < currentLineIndex) || syncState === 'done'

          return (
            <div
              key={idx}
              onClick={() => {
                if ((syncState === 'syncing' || syncState === 'done') && isMarked) {
                  goBackToLine(idx)
                }
              }}
              className={[
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all',
                isActive ? 'bg-primary/15 font-semibold text-foreground' : '',
                isPast ? 'opacity-60 cursor-pointer hover:opacity-80 hover:bg-surface-hover' : '',
                !isActive && !isPast ? 'text-foreground' : '',
              ].join(' ')}
            >
              <span className="flex-1">{line}</span>
              {isMarked && (
                <span className="shrink-0 text-xs text-text-muted font-mono">
                  {formatTime(timestamps[idx])}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {syncState === 'idle' && (
          <>
            <Button variant="primary" className="flex-1" onClick={handleStartSyncing}>
              התחל סנכרון
            </Button>
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          </>
        )}

        {syncState === 'syncing' && (
          <Button
            variant="primary"
            size="lg"
            className="flex-1 text-lg py-4"
            onClick={markLine}
          >
            סמן שורה ({currentLineIndex + 1}/{lines.length})
          </Button>
        )}

        {syncState === 'done' && (
          <>
            {onSavedAndNext ? (
              <>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleSaveAndNext}
                  loading={saving}
                >
                  שמירה + קטע הבא
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSave}
                  loading={saving}
                >
                  שמירה וסיום
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleSave}
                loading={saving}
              >
                שמירה
              </Button>
            )}
            <Button variant="outline" onClick={handleRedo}>
              מחדש
            </Button>
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          </>
        )}
      </div>

      {syncState === 'syncing' && (
        <p className="text-center text-xs text-text-muted">
          Space/Enter = סמן שורה &middot; Backspace/חץ למעלה = חזרה לשורה קודמת &middot; חצים שמאלה/ימינה = קפיצה 3 שניות
        </p>
      )}
    </div>
  )
}
