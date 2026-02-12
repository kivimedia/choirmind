'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  AudioTrackData,
  AudioEngineState,
  AudioEngineActions,
  AudioSourceType,
  VoicePart,
} from '@/lib/audio/types'

// ---------------------------------------------------------------------------
// Howler lazy import guard (SSR-safe)
// ---------------------------------------------------------------------------

let HowlClass: typeof import('howler').Howl | null = null

function getHowl() {
  if (typeof window === 'undefined') return null
  if (!HowlClass) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    HowlClass = require('howler').Howl
  }
  return HowlClass
}

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UseAudioEngineOptions {
  audioTracks: AudioTrackData[]
  userVoicePart?: VoicePart | null
  youtubeVideoId?: string | null
  spotifyTrackId?: string | null
  /** Called every ~250ms with current time in ms. */
  onTimeUpdate?: (ms: number) => void
}

// ---------------------------------------------------------------------------
// Priority logic: pick the best track for a given voice part
// ---------------------------------------------------------------------------

function pickTrack(
  tracks: AudioTrackData[],
  desired: VoicePart | null,
): AudioTrackData | null {
  if (tracks.length === 0) return null

  // Exact match
  if (desired) {
    const exact = tracks.find((t) => t.voicePart === desired)
    if (exact) return exact
  }

  // Fallback chain: mix → playback → full → first available
  const fallbacks: VoicePart[] = ['mix', 'playback', 'full']
  for (const fb of fallbacks) {
    const found = tracks.find((t) => t.voicePart === fb)
    if (found) return found
  }

  return tracks[0]
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudioEngine(options: UseAudioEngineOptions): AudioEngineState & AudioEngineActions {
  const {
    audioTracks,
    userVoicePart,
    youtubeVideoId,
    spotifyTrackId,
    onTimeUpdate,
  } = options

  // Stable callback ref
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate

  // Available parts
  const availableParts = useMemo<VoicePart[]>(
    () => [...new Set(audioTracks.map((t) => t.voicePart))],
    [audioTracks],
  )

  // Determine audio source type
  const sourceType = useMemo<AudioSourceType>(() => {
    if (audioTracks.length > 0) return 'howler'
    if (youtubeVideoId) return 'youtube'
    if (spotifyTrackId) return 'spotify'
    return 'none'
  }, [audioTracks.length, youtubeVideoId, spotifyTrackId])

  // State
  const [voicePart, setVoicePartState] = useState<VoicePart | null>(
    (userVoicePart as VoicePart) ?? null,
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [playbackRate, setPlaybackRateState] = useState(1)
  const [loop, setLoopState] = useState<{ startMs: number; endMs: number } | null>(null)

  // Refs
  const howlRef = useRef<import('howler').Howl | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loopRef = useRef(loop)
  loopRef.current = loop

  // Current track to play
  const activeTrack = useMemo(
    () => pickTrack(audioTracks, voicePart),
    [audioTracks, voicePart],
  )

  // ---------------------------------------------------------------------------
  // Howl lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (sourceType !== 'howler' || !activeTrack) return

    const Howl = getHowl()
    if (!Howl) return

    // Destroy previous howl
    if (howlRef.current) {
      howlRef.current.unload()
      howlRef.current = null
    }

    setIsLoading(true)

    const howl = new Howl({
      src: [activeTrack.fileUrl],
      html5: true,
      preload: true,
      rate: playbackRate,
      onload: () => {
        setIsLoading(false)
        setDurationMs(howl.duration() * 1000)
      },
      onloaderror: () => {
        setIsLoading(false)
      },
      onplay: () => {
        setIsPlaying(true)
      },
      onpause: () => {
        setIsPlaying(false)
      },
      onstop: () => {
        setIsPlaying(false)
      },
      onend: () => {
        setIsPlaying(false)
        setCurrentTimeMs(0)
      },
    })

    howlRef.current = howl

    return () => {
      howl.unload()
      howlRef.current = null
      setIsPlaying(false)
    }
    // We intentionally only react to activeTrack changes, not playbackRate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, activeTrack?.id])

  // ---------------------------------------------------------------------------
  // Time polling (250ms)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    if (!isPlaying || sourceType !== 'howler') return

    pollRef.current = setInterval(() => {
      const howl = howlRef.current
      if (!howl) return

      const seekMs = (howl.seek() as number) * 1000

      // Loop handling
      const currentLoop = loopRef.current
      if (currentLoop && seekMs >= currentLoop.endMs) {
        howl.seek(currentLoop.startMs / 1000)
        return
      }

      setCurrentTimeMs(seekMs)
      onTimeUpdateRef.current?.(seekMs)
    }, 250)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [isPlaying, sourceType])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const play = useCallback(() => {
    if (sourceType === 'howler' && howlRef.current) {
      howlRef.current.play()
    }
  }, [sourceType])

  const pause = useCallback(() => {
    if (sourceType === 'howler' && howlRef.current) {
      howlRef.current.pause()
    }
  }, [sourceType])

  const toggle = useCallback(() => {
    if (isPlaying) pause()
    else play()
  }, [isPlaying, play, pause])

  const seekTo = useCallback((ms: number) => {
    if (howlRef.current) {
      howlRef.current.seek(ms / 1000)
      setCurrentTimeMs(ms)
      onTimeUpdateRef.current?.(ms)
    }
  }, [])

  const setVoicePart = useCallback((part: VoicePart) => {
    const wasPlaying = howlRef.current?.playing() ?? false

    setVoicePartState(part)
    setCurrentTimeMs(0)

    // Start from the beginning with the new voice
    if (wasPlaying) {
      setTimeout(() => {
        if (howlRef.current) {
          howlRef.current.seek(0)
          howlRef.current.play()
        }
      }, 100)
    }
  }, [])

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(1.25, rate))
    setPlaybackRateState(clamped)
    if (howlRef.current) {
      howlRef.current.rate(clamped)
    }
  }, [])

  const setLoop = useCallback((startMs: number, endMs: number) => {
    setLoopState({ startMs, endMs })
  }, [])

  const clearLoop = useCallback(() => {
    setLoopState(null)
  }, [])

  // ---------------------------------------------------------------------------
  // Return combined state + actions
  // ---------------------------------------------------------------------------

  return {
    // State
    sourceType,
    isPlaying,
    currentTimeMs,
    durationMs,
    voicePart,
    playbackRate,
    availableParts,
    isLoading,
    loop,
    // Actions
    play,
    pause,
    toggle,
    seekTo,
    setVoicePart,
    setPlaybackRate,
    setLoop,
    clearLoop,
  }
}
