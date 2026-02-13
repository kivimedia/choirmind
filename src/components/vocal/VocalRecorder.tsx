'use client'

import Button from '@/components/ui/Button'

interface VocalRecorderProps {
  isRecording: boolean
  isPaused: boolean
  durationMs: number
  analyserData: Uint8Array | null
  error: string | null
  onStart: () => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
}

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function Waveform({ data }: { data: Uint8Array | null }) {
  if (!data) return null

  const bars = 32
  const step = Math.floor(data.length / bars)
  const values: number[] = []
  for (let i = 0; i < bars; i++) {
    const val = data[i * step] ?? 128
    values.push(Math.abs(val - 128) / 128)
  }

  return (
    <div className="flex items-center justify-center gap-0.5 h-16">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-primary transition-all duration-75"
          style={{ height: `${Math.max(4, v * 64)}px` }}
        />
      ))}
    </div>
  )
}

export default function VocalRecorder({
  isRecording,
  isPaused,
  durationMs,
  analyserData,
  error,
  onStart,
  onStop,
  onPause,
  onResume,
}: VocalRecorderProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Waveform visualization */}
      <div className="h-16 w-full max-w-sm">
        {isRecording ? (
          <Waveform data={analyserData} />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            {'לחצו על הכפתור כדי להתחיל הקלטה'}
          </div>
        )}
      </div>

      {/* Timer */}
      {isRecording && (
        <p className="text-3xl font-bold text-foreground tabular-nums" dir="ltr">
          {formatTime(durationMs)}
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {!isRecording ? (
          <button
            onClick={onStart}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            aria-label="התחל הקלטה"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="6" />
            </svg>
          </button>
        ) : (
          <>
            {isPaused ? (
              <Button variant="outline" size="md" onClick={onResume}>
                {'המשך'}
              </Button>
            ) : (
              <Button variant="outline" size="md" onClick={onPause}>
                {'השהה'}
              </Button>
            )}
            <button
              onClick={onStop}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
              aria-label="עצור הקלטה"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-danger text-center">{error}</p>
      )}
    </div>
  )
}
