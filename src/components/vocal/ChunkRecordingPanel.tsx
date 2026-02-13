'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ScoreDial from './ScoreDial'
import ScoreBreakdown from './ScoreBreakdown'
import CoachingTipCard from './CoachingTipCard'
import { useVocalRecorder } from '@/hooks/useVocalRecorder'
import type { AudioActions } from '@/components/audio/AudioPlayer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkInfo {
  id: string
  label: string
  lyrics: string
  audioStartMs?: number | null
  audioEndMs?: number | null
}

interface SessionResult {
  overallScore: number
  pitchScore: number
  timingScore: number
  dynamicsScore: number
  coachingTips: string[]
  xpEarned: number
}

interface ChunkRecordingPanelProps {
  isOpen: boolean
  onClose: () => void
  chunk: ChunkInfo
  songId: string
  songTitle: string
  voicePart: string
  textDirection: string
  audioActions?: AudioActions | null
  hasAudio: boolean
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Step = 'ready' | 'recording' | 'uploading' | 'analyzing' | 'results'

// ---------------------------------------------------------------------------
// Waveform visualization
// ---------------------------------------------------------------------------

function MiniWaveform({ data }: { data: Uint8Array | null }) {
  if (!data) return <div className="h-10" />
  const bars = 24
  const step = Math.floor(data.length / bars)
  const values: number[] = []
  for (let i = 0; i < bars; i++) {
    const val = data[i * step] ?? 128
    values.push(Math.abs(val - 128) / 128)
  }
  return (
    <div className="flex items-center justify-center gap-0.5 h-10">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-primary transition-all duration-75"
          style={{ height: `${Math.max(3, v * 40)}px` }}
        />
      ))}
    </div>
  )
}

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChunkRecordingPanel({
  isOpen,
  onClose,
  chunk,
  songId,
  songTitle,
  voicePart,
  textDirection,
  audioActions,
  hasAudio,
}: ChunkRecordingPanelProps) {
  const recorder = useVocalRecorder()
  const [step, setStep] = useState<Step>('ready')
  const [withBacking, setWithBacking] = useState(true)
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep('ready')
      setJobId(null)
      setResult(null)
      setErrorMsg(null)
      recorder.reset()
      if (pollRef.current) clearInterval(pollRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Start recording — optionally play backing track
  const handleStartRecording = useCallback(async () => {
    setErrorMsg(null)
    try {
      await recorder.startRecording()
    } catch {
      setErrorMsg('לא ניתן להפעיל מיקרופון')
      return
    }

    if (withBacking && audioActions && hasAudio) {
      if (chunk.audioStartMs != null) {
        audioActions.seekTo(chunk.audioStartMs)
      }
      audioActions.play()
    }
    setStep('recording')
  }, [recorder, withBacking, audioActions, hasAudio, chunk.audioStartMs])

  // Stop recording — pause backing track
  const handleStopRecording = useCallback(() => {
    recorder.stopRecording()
    if (audioActions?.isPlaying) {
      audioActions.pause()
    }
  }, [recorder, audioActions])

  // Upload + create job when blob is ready
  useEffect(() => {
    if (!recorder.audioBlob || step !== 'recording') return

    const controller = new AbortController()
    abortRef.current = controller

    async function uploadAndSubmit() {
      setStep('uploading')
      try {
        const blob = recorder.audioBlob!
        const ext = blob.type.includes('webm') ? 'webm' : 'mp4'

        // Get presigned URL with timeout
        const presignRes = await fetch('/api/vocal-analysis/upload-presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId,
            voicePart,
            filename: `chunk-${chunk.id}.${ext}`,
            contentType: blob.type,
            durationMs: recorder.durationMs,
          }),
          signal: controller.signal,
        })
        if (!presignRes.ok) {
          const errData = await presignRes.json().catch(() => ({}))
          throw new Error(errData.error || 'שגיאה בהכנת ההעלאה')
        }
        const { uploadUrl, key } = await presignRes.json()

        // Upload to S3 with timeout
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': blob.type },
          signal: controller.signal,
        })
        if (!uploadRes.ok) throw new Error('שגיאה בהעלאת הקובץ')

        // Create analysis job
        const jobRes = await fetch('/api/vocal-analysis/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId,
            voicePart,
            recordingS3Key: key,
            recordingDurationMs: recorder.durationMs,
            useHeadphones: !withBacking,
          }),
          signal: controller.signal,
        })
        if (!jobRes.ok) {
          const err = await jobRes.json().catch(() => ({}))
          throw new Error(err.error || 'שגיאה ביצירת הניתוח')
        }
        const job = await jobRes.json()
        setJobId(job.id)
        setStep('analyzing')
      } catch (err) {
        if (controller.signal.aborted) return
        setErrorMsg(err instanceof Error ? err.message : 'שגיאה בהעלאת ההקלטה')
        setStep('ready')
      }
    }
    uploadAndSubmit()

    return () => { controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.audioBlob])

  // Poll for results
  useEffect(() => {
    if (step !== 'analyzing' || !jobId) return

    let attempts = 0
    const maxAttempts = 60 // ~3 min timeout

    pollRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        setErrorMsg('הניתוח לוקח יותר מדי זמן, נסו שוב')
        setStep('ready')
        if (pollRef.current) clearInterval(pollRef.current)
        return
      }

      try {
        const res = await fetch(`/api/vocal-analysis/jobs/${jobId}`)
        if (!res.ok) return
        const data = await res.json()
        const job = data.job ?? data

        if (job.status === 'COMPLETED' && job.practiceSession) {
          const ps = job.practiceSession
          setResult({
            overallScore: ps.overallScore,
            pitchScore: ps.pitchScore,
            timingScore: ps.timingScore,
            dynamicsScore: ps.dynamicsScore,
            coachingTips: JSON.parse(ps.coachingTips || '[]'),
            xpEarned: ps.xpEarned,
          })
          setStep('results')
          if (pollRef.current) clearInterval(pollRef.current)
        } else if (job.status === 'FAILED') {
          setErrorMsg(job.errorMessage || 'הניתוח נכשל')
          setStep('ready')
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {
        // Retry on next tick
      }
    }, 3000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [step, jobId])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${chunk.label}`}>
      <div className="space-y-4">
        {/* Chunk lyrics */}
        <div
          className="rounded-lg bg-border/10 p-3 max-h-32 overflow-y-auto"
          dir={textDirection === 'rtl' ? 'rtl' : textDirection === 'ltr' ? 'ltr' : 'auto'}
        >
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {chunk.lyrics}
          </p>
        </div>

        {/* ==================== Ready ==================== */}
        {step === 'ready' && (
          <div className="space-y-4">
            {/* Backing track toggle */}
            {hasAudio && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withBacking}
                  onChange={(e) => setWithBacking(e.target.checked)}
                  className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {'נגן מוזיקה ברקע'}
                  </span>
                  <p className="text-xs text-text-muted">
                    {'השיר ינוגן בזמן שתשירו'}
                  </p>
                </div>
              </label>
            )}

            {errorMsg && (
              <p className="text-sm text-danger text-center">{errorMsg}</p>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleStartRecording}
            >
              {'התחילו הקלטה'}
            </Button>
          </div>
        )}

        {/* ==================== Recording ==================== */}
        {step === 'recording' && (
          <div className="flex flex-col items-center gap-4">
            <MiniWaveform data={recorder.analyserData} />

            <p className="text-2xl font-bold text-foreground tabular-nums" dir="ltr">
              {formatTime(recorder.durationMs)}
            </p>

            {withBacking && hasAudio && (
              <p className="text-xs text-text-muted">
                {'מוזיקה מנגנת ברקע'}
              </p>
            )}

            <button
              onClick={handleStopRecording}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
              aria-label="עצור הקלטה"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </div>
        )}

        {/* ==================== Uploading ==================== */}
        {step === 'uploading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-foreground">{'מעלה ומנתח...'}</p>
            <button
              onClick={() => {
                if (abortRef.current) abortRef.current.abort()
                setErrorMsg('ההעלאה בוטלה')
                setStep('ready')
              }}
              className="text-xs text-text-muted hover:text-foreground"
            >
              {'ביטול'}
            </button>
          </div>
        )}

        {/* ==================== Analyzing ==================== */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-foreground">{'מנתח את הביצוע שלכם...'}</p>
            <p className="text-xs text-text-muted">{'בדרך כלל 10-30 שניות'}</p>
          </div>
        )}

        {/* ==================== Results ==================== */}
        {step === 'results' && result && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <ScoreDial score={result.overallScore} size="md" />
              <p className="text-xs text-text-muted">
                {'+' + result.xpEarned + ' XP'}
              </p>
            </div>

            <ScoreBreakdown
              pitchScore={result.pitchScore}
              timingScore={result.timingScore}
              dynamicsScore={result.dynamicsScore}
            />

            {result.coachingTips.length > 0 && (
              <CoachingTipCard tips={result.coachingTips} />
            )}

            <div className="flex gap-3">
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                onClick={() => {
                  recorder.reset()
                  setResult(null)
                  setStep('ready')
                }}
              >
                {'הקליטו שוב'}
              </Button>
              <Button
                variant="outline"
                size="md"
                className="flex-1"
                onClick={onClose}
              >
                {'סיום'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
