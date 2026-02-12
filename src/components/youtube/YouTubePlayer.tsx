'use client'

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'

// ---------------------------------------------------------------------------
// Singleton YT IFrame API loader
// ---------------------------------------------------------------------------

let ytApiPromise: Promise<void> | null = null

function loadYTApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise
  if (typeof window === 'undefined') return Promise.reject()

  // If already loaded
  if (window.YT?.Player) return Promise.resolve()

  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })

  return ytApiPromise
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface YouTubePlayerHandle {
  play(): void
  pause(): void
  seekTo(seconds: number): void
  getCurrentTime(): number
}

interface YouTubePlayerProps {
  videoId: string
  /** When true, polls getCurrentTime() every 250ms and calls onTimeUpdate */
  enableTimeTracking?: boolean
  /** Called with current playback time in milliseconds */
  onTimeUpdate?: (timeMs: number) => void
  /** Called when player state changes */
  onStateChange?: (state: number) => void
  /** Called when player is ready */
  onReady?: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Component — renders a visible iframe immediately, then enhances with YT API
// ---------------------------------------------------------------------------

const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer(
    { videoId, enableTimeTracking, onTimeUpdate, onStateChange, onReady, className },
    ref
  ) {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const playerRef = useRef<YTPlayer | null>(null)
    const isReadyRef = useRef(false)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const isPlayingRef = useRef(false)
    const pendingSeekRef = useRef<number | null>(null)
    const pendingPlayRef = useRef(false)
    const [iframeId] = useState(() => `yt-player-${Math.random().toString(36).slice(2, 9)}`)

    // Stable callback refs
    const onTimeUpdateRef = useRef(onTimeUpdate)
    onTimeUpdateRef.current = onTimeUpdate
    const onStateChangeRef = useRef(onStateChange)
    onStateChangeRef.current = onStateChange
    const onReadyRef = useRef(onReady)
    onReadyRef.current = onReady

    // Expose player controls via ref — safe wrappers that handle not-ready state
    useImperativeHandle(ref, () => ({
      play() {
        if (isReadyRef.current && playerRef.current) {
          try { playerRef.current.playVideo() } catch { /* not ready */ }
        } else {
          pendingPlayRef.current = true
        }
      },
      pause() {
        if (isReadyRef.current && playerRef.current) {
          try { playerRef.current.pauseVideo() } catch { /* not ready */ }
        }
      },
      seekTo(seconds: number) {
        if (isReadyRef.current && playerRef.current && typeof playerRef.current.seekTo === 'function') {
          try { playerRef.current.seekTo(seconds, true) } catch { /* not ready */ }
        } else {
          pendingSeekRef.current = seconds
        }
      },
      getCurrentTime() {
        if (isReadyRef.current && playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          try { return playerRef.current.getCurrentTime() } catch { return 0 }
        }
        return 0
      },
    }))

    // Start/stop time tracking
    const startTracking = useCallback(() => {
      if (intervalRef.current) return
      intervalRef.current = setInterval(() => {
        if (playerRef.current && isPlayingRef.current && isReadyRef.current) {
          try {
            const timeMs = playerRef.current.getCurrentTime() * 1000
            onTimeUpdateRef.current?.(timeMs)
          } catch { /* player not ready */ }
        }
      }, 250)
    }, [])

    const stopTracking = useCallback(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }, [])

    // Enhance the iframe with the YT API once it loads
    useEffect(() => {
      let destroyed = false

      async function init() {
        try {
          await loadYTApi()
        } catch {
          return // SSR or script failed — iframe still works as plain embed
        }
        if (destroyed || !window.YT?.Player) return

        // Wrap the existing iframe with the YT Player API
        playerRef.current = new window.YT.Player(iframeId, {
          events: {
            onReady: () => {
              if (destroyed) return
              isReadyRef.current = true
              onReadyRef.current?.()

              // Flush any pending operations
              if (pendingSeekRef.current !== null) {
                try { playerRef.current?.seekTo(pendingSeekRef.current, true) } catch { /* */ }
                pendingSeekRef.current = null
              }
              if (pendingPlayRef.current) {
                try { playerRef.current?.playVideo() } catch { /* */ }
                pendingPlayRef.current = false
              }
            },
            onStateChange: (event: YTOnStateChangeEvent) => {
              if (destroyed) return
              const state = event.data
              onStateChangeRef.current?.(state)

              isPlayingRef.current = state === 1

              if (enableTimeTracking) {
                if (state === 1) {
                  startTracking()
                } else {
                  stopTracking()
                }
              }
            },
          },
        })
      }

      init()

      return () => {
        destroyed = true
        isReadyRef.current = false
        stopTracking()
        // Don't call destroy() — it removes the iframe from DOM
        playerRef.current = null
      }
    }, [videoId, iframeId, enableTimeTracking, startTracking, stopTracking])

    return (
      <div className={className}>
        <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingBottom: '56.25%' }}>
          <iframe
            id={iframeId}
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full rounded-xl"
          />
        </div>
      </div>
    )
  }
)

export default YouTubePlayer
