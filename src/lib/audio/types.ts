// ---------------------------------------------------------------------------
// Voice parts
// ---------------------------------------------------------------------------

export const VOICE_PARTS = [
  'soprano',
  'mezzo',
  'alto',
  'tenor',
  'baritone',
  'bass',
  'mix',
  'playback',
  'full',
] as const

export type VoicePart = (typeof VOICE_PARTS)[number]

/** Parts that represent individual singer voices (not mix/playback/full). */
export const SINGER_VOICE_PARTS: VoicePart[] = [
  'soprano',
  'mezzo',
  'alto',
  'tenor',
  'baritone',
  'bass',
]

// ---------------------------------------------------------------------------
// Audio track data (from API / DB)
// ---------------------------------------------------------------------------

export interface AudioTrackData {
  id: string
  songId: string
  voicePart: VoicePart
  fileUrl: string
  sourceUrl?: string | null
  durationMs?: number | null
}

// ---------------------------------------------------------------------------
// Audio engine state & actions
// ---------------------------------------------------------------------------

export type AudioSourceType = 'howler' | 'youtube' | 'spotify' | 'none'

export interface AudioEngineState {
  /** Which audio backend is active. */
  sourceType: AudioSourceType
  /** Is audio currently playing? */
  isPlaying: boolean
  /** Current playback position in milliseconds. */
  currentTimeMs: number
  /** Total duration in milliseconds (0 if unknown). */
  durationMs: number
  /** Currently selected voice part. */
  voicePart: VoicePart | null
  /** Playback rate (0.5–1.25). */
  playbackRate: number
  /** Available voice parts for this song's audio tracks. */
  availableParts: VoicePart[]
  /** Whether audio is loading / buffering. */
  isLoading: boolean
  /** Loop boundaries in ms (null = no loop). */
  loop: { startMs: number; endMs: number } | null
}

export interface AudioEngineActions {
  play(): void
  pause(): void
  toggle(): void
  seekTo(ms: number): void
  setVoicePart(part: VoicePart): void
  setPlaybackRate(rate: number): void
  setLoop(startMs: number, endMs: number): void
  clearLoop(): void
}
