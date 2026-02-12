// YouTube IFrame API type declarations
// https://developers.google.com/youtube/iframe_api_reference

interface YTPlayerOptions {
  width?: number | string
  height?: number | string
  videoId?: string
  playerVars?: {
    autoplay?: 0 | 1
    controls?: 0 | 1
    disablekb?: 0 | 1
    enablejsapi?: 0 | 1
    loop?: 0 | 1
    modestbranding?: 0 | 1
    origin?: string
    playsinline?: 0 | 1
    rel?: 0 | 1
    start?: number
    end?: number
  }
  events?: {
    onReady?: (event: YTPlayerEvent) => void
    onStateChange?: (event: YTOnStateChangeEvent) => void
    onError?: (event: YTPlayerEvent) => void
  }
}

interface YTPlayerEvent {
  target: YTPlayer
  data?: number
}

interface YTOnStateChangeEvent {
  target: YTPlayer
  data: number
}

interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  setVolume(volume: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  destroy(): void
  getVideoUrl(): string
  getVideoEmbedCode(): string
}

interface YTPlayerState {
  UNSTARTED: -1
  ENDED: 0
  PLAYING: 1
  PAUSED: 2
  BUFFERING: 3
  CUED: 5
}

interface YTStatic {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayer
  PlayerState: YTPlayerState
}

// Augment the Window interface
interface Window {
  YT?: YTStatic
  onYouTubeIframeAPIReady?: () => void
}
