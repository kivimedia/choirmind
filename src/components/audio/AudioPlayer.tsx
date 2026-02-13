'use client'

import { useEffect, useRef } from 'react'
import type { AudioTrackData, VoicePart } from '@/lib/audio/types'
import { useAudioEngine } from '@/hooks/useAudioEngine'
import VoicePartSelector from './VoicePartSelector'
import SpeedControl from './SpeedControl'
import YouTubePlayer, { type YouTubePlayerHandle } from '@/components/youtube/YouTubePlayer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AudioActions {
  play: () => void
  pause: () => void
  seekTo: (ms: number) => void
  isPlaying: boolean
}

interface AudioPlayerProps {
  audioTracks: AudioTrackData[]
  userVoicePart?: VoicePart | null
  youtubeVideoId?: string | null
  spotifyTrackId?: string | null
  /** Called with current time in ms — wires into KaraokeDisplay. */
  onTimeUpdate?: (ms: number) => void
  /** Seek to a specific time externally (e.g., when changing chunks). */
  seekToMs?: number | null
  /** Ref that gets set to audio control actions for external use. */
  actionsRef?: React.MutableRefObject<AudioActions | null>
  locale?: string
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AudioPlayer({
  audioTracks,
  userVoicePart,
  youtubeVideoId,
  spotifyTrackId,
  onTimeUpdate,
  seekToMs,
  actionsRef,
  locale = 'he',
  className,
}: AudioPlayerProps) {
  const ytRef = useRef<YouTubePlayerHandle>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const engine = useAudioEngine({
    audioTracks,
    userVoicePart,
    youtubeVideoId,
    spotifyTrackId,
    onTimeUpdate,
  })

  // Expose engine actions to parent via ref
  useEffect(() => {
    if (actionsRef) {
      actionsRef.current = {
        play: engine.play,
        pause: engine.pause,
        seekTo: engine.seekTo,
        isPlaying: engine.isPlaying,
      }
    }
  })

  // Handle external seek requests
  const lastSeekRef = useRef<number | null>(null)
  useEffect(() => {
    if (seekToMs != null && seekToMs !== lastSeekRef.current) {
      lastSeekRef.current = seekToMs
      if (engine.sourceType === 'howler') {
        engine.seekTo(seekToMs)
      } else if (engine.sourceType === 'youtube' && ytRef.current) {
        ytRef.current.seekTo(seekToMs / 1000)
      }
    }
  }, [seekToMs, engine])

  // ---------------------------------------------------------------------------
  // Howler player UI
  // ---------------------------------------------------------------------------

  if (engine.sourceType === 'howler') {
    const progress = engine.durationMs > 0 ? (engine.currentTimeMs / engine.durationMs) * 100 : 0

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressBarRef.current
      if (!bar || engine.durationMs === 0) return
      const rect = bar.getBoundingClientRect()
      // Controls container uses dir="ltr", so progress always goes left-to-right
      const ratio = (e.clientX - rect.left) / rect.width
      const targetMs = Math.max(0, Math.min(engine.durationMs, ratio * engine.durationMs))
      engine.seekTo(targetMs)
    }

    return (
      <div className={['space-y-2', className].filter(Boolean).join(' ')}>
        {/* Voice part selector */}
        <VoicePartSelector
          availableParts={engine.availableParts}
          selectedPart={engine.voicePart}
          onSelect={engine.setVoicePart}
          locale={locale}
        />

        {/* Player controls */}
        <div dir="ltr" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          {/* Skip back 3s */}
          <button
            type="button"
            onClick={() => engine.seekTo(Math.max(0, engine.currentTimeMs - 3000))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-foreground hover:bg-surface-hover active:bg-border"
            aria-label="Skip back 3 seconds"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            type="button"
            onClick={engine.toggle}
            disabled={engine.isLoading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            aria-label={engine.isPlaying ? 'Pause' : 'Play'}
          >
            {engine.isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : engine.isPlaying ? (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="h-4 w-4 ms-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Skip forward 3s */}
          <button
            type="button"
            onClick={() => engine.seekTo(Math.min(engine.durationMs, engine.currentTimeMs + 3000))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-foreground hover:bg-surface-hover active:bg-border"
            aria-label="Skip forward 3 seconds"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          </button>

          {/* Time + progress */}
          <div className="flex flex-1 flex-col gap-1">
            <div
              ref={progressBarRef}
              onClick={handleProgressClick}
              className="group relative h-2 w-full cursor-pointer rounded-full bg-border/40"
            >
              <div
                className="absolute inset-y-0 rounded-full bg-primary transition-[width] duration-100"
                style={{ left: 0, width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[12px] text-text-muted tabular-nums">
              <span>{formatTime(engine.currentTimeMs)}</span>
              <span>{formatTime(engine.durationMs)}</span>
            </div>
          </div>

          {/* Speed control */}
          <SpeedControl rate={engine.playbackRate} onRateChange={engine.setPlaybackRate} />
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // YouTube fallback
  // ---------------------------------------------------------------------------

  if (engine.sourceType === 'youtube' && youtubeVideoId) {
    return (
      <div className={['mx-auto w-full max-w-sm', className].filter(Boolean).join(' ')}>
        <YouTubePlayer
          ref={ytRef}
          videoId={youtubeVideoId}
          enableTimeTracking
          onTimeUpdate={onTimeUpdate}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Spotify fallback
  // ---------------------------------------------------------------------------

  if (engine.sourceType === 'spotify' && spotifyTrackId) {
    return (
      <div className={className}>
        <iframe
          src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator&theme=0`}
          width="100%"
          height="80"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="rounded-xl"
        />
      </div>
    )
  }

  // No audio source
  return null
}
