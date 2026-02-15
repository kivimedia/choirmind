'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ScoreDial from './ScoreDial'
import SectionTimeline from './SectionTimeline'
import { useVocalRecorder } from '@/hooks/useVocalRecorder'
import MicSelector from './MicSelector'
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
  lineTimestamps?: number[] | null
}

interface SectionScoreData {
  sectionIndex: number
  startTime: number
  endTime: number
  overallScore: number | null
  pitchScore: number | null
  timingScore: number | null
  dynamicsScore: number | null
  refNote: string | null
  userNote: string | null
  noteMatch: boolean | null
  pitchClassMatch?: boolean | null
  octaveDiff?: number | null
}

interface NoteComparisonData {
  noteIndex: number
  refNote: string | null
  refStartTime: number
  refEndTime: number
  userNote: string | null
  userStartTime: number | null
  userEndTime: number | null
  noteMatch: boolean
  pitchClassMatch: boolean | null
  octaveDiff: number | null
  centsOff: number | null
  timingOffsetMs: number | null
}

interface ProblemArea {
  startTime: number
  endTime: number
  issues: string[]
  avgPitchDevCents: number
  avgTimingOffsetMs: number
  avgEnergyRatio: number
  refStartTime?: number
  refEndTime?: number
}

interface SessionResult {
  overallScore: number
  pitchScore: number
  timingScore: number
  dynamicsScore: number
  coachingTips: string[]
  xpEarned: number
  sectionScores: SectionScoreData[]
  problemAreas: ProblemArea[]
  noteComparison: NoteComparisonData[]
  isolatedVocalUrl?: string
  originalRecordingUrl?: string
  isMock?: boolean
}

interface ReferenceVocalInfo {
  id: string
  voicePart: string
  isolatedFileUrl: string | null
  accompanimentFileUrl?: string | null
}

type RecordingAudioMode = 'full_mix' | 'vocals_only' | 'music_only'

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
  /** Direct URL of the backing track for standalone playback during recording. */
  backingTrackUrl?: string | null
  /** Reference vocals for mode switching during recording. */
  referenceVocals?: ReferenceVocalInfo[]
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
// Parse practice session into SessionResult
// ---------------------------------------------------------------------------

function parsePracticeSession(ps: Record<string, unknown>): SessionResult {
  let sectionScores: SectionScoreData[] = []
  let isolatedVocalUrl: string | undefined
  let originalRecordingUrl: string | undefined
  let isMock = false
  try {
    const rawSections = ps.sectionScores ? JSON.parse(ps.sectionScores as string) : []
    if (Array.isArray(rawSections)) {
      sectionScores = rawSections
    } else if (rawSections.sections) {
      sectionScores = rawSections.sections
      isolatedVocalUrl = rawSections.isolatedVocalUrl
      originalRecordingUrl = rawSections.originalRecordingUrl
      isMock = !!rawSections.isMock
    }
  } catch {}

  let problemAreas: ProblemArea[] = []
  try { problemAreas = JSON.parse((ps.problemAreas as string) || '[]') } catch {}

  // noteComparison is embedded in the sectionScores wrapper JSON
  let noteComparison: NoteComparisonData[] = []
  try {
    const rawSections2 = ps.sectionScores ? JSON.parse(ps.sectionScores as string) : {}
    if (!Array.isArray(rawSections2) && rawSections2.noteComparison) {
      noteComparison = rawSections2.noteComparison
    }
  } catch {}

  return {
    overallScore: ps.overallScore as number,
    pitchScore: ps.pitchScore as number,
    timingScore: ps.timingScore as number,
    dynamicsScore: ps.dynamicsScore as number,
    coachingTips: (() => { try { return JSON.parse((ps.coachingTips as string) || '[]') } catch { return [] } })(),
    xpEarned: ps.xpEarned as number,
    sectionScores,
    problemAreas,
    noteComparison,
    isolatedVocalUrl,
    originalRecordingUrl,
    isMock,
  }
}

// ---------------------------------------------------------------------------
// Analyzing progress indicator
// ---------------------------------------------------------------------------

const ANALYSIS_STAGES: { key: string; label: string }[] = [
  { key: 'uploading', label: 'מעלה הקלטה' },
  { key: 'downloading', label: 'מוריד הקלטה לשרת' },
  { key: 'isolating', label: 'מפריד קול (Demucs AI)' },
  { key: 'extracting', label: 'מחלץ מאפייני קול' },
  { key: 'loading_reference', label: 'טוען קול ייחוס' },
  { key: 'scoring', label: 'מחשב ציון' },
  { key: 'saving', label: 'שומר תוצאות' },
]

// When headphones skip Demucs, backend sends "converting" instead of "isolating"
const STAGE_ALIASES: Record<string, string> = {
  converting: 'isolating',
}

const HEADPHONES_LABELS: Record<string, string> = {
  isolating: 'ממיר הקלטה',
}

function AnalyzingProgress({ stage, onCancel, useHeadphones }: { stage: string | null; onCancel: () => void; useHeadphones?: boolean }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startRef.current)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const resolvedStageKey = stage && STAGE_ALIASES[stage] ? STAGE_ALIASES[stage] : stage

  // Find active step index from server stage
  const activeStep = ANALYSIS_STAGES.findIndex((s) => s.key === resolvedStageKey)
  const effectiveStep = activeStep >= 0 ? activeStep : 0

  return (
    <div className="space-y-4 py-2">
      {/* Steps list */}
      <div className="space-y-2">
        {ANALYSIS_STAGES.map((s, i) => {
          const isDone = i < effectiveStep
          const isActive = i === effectiveStep
          const isPending = i > effectiveStep
          const label = useHeadphones && HEADPHONES_LABELS[s.key] ? HEADPHONES_LABELS[s.key] : s.label
          return (
            <div
              key={i}
              className={[
                'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-300',
                isActive ? 'bg-primary/10 text-foreground font-medium' : '',
                isDone ? 'text-text-muted' : '',
                isPending ? 'text-text-muted/40' : '',
              ].join(' ')}
            >
              {isDone && (
                <svg className="h-4 w-4 shrink-0 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isActive && (
                <svg className="h-4 w-4 shrink-0 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isPending && (
                <div className="h-4 w-4 shrink-0 rounded-full border-2 border-border/40" />
              )}
              <span>{label}</span>
            </div>
          )
        })}
      </div>

      {/* Elapsed time */}
      <p className="text-center text-xs text-text-muted tabular-nums" dir="ltr">
        {Math.floor(elapsed / 1000)}s
      </p>

      <button
        onClick={onCancel}
        className="mx-auto block text-xs text-text-muted hover:text-foreground"
      >
        {'ביטול'}
      </button>
    </div>
  )
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
  backingTrackUrl,
  referenceVocals = [],
}: ChunkRecordingPanelProps) {
  const [step, setStep] = useState<Step>('ready')
  const [withBacking, setWithBacking] = useState(true)
  const [useHeadphones, setUseHeadphones] = useState(false)
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null)
  const [recordingAudioMode, setRecordingAudioMode] = useState<RecordingAudioMode>('full_mix')

  // Compute effective backing URL based on audio mode
  const effectiveBackingUrl = useMemo(() => {
    if (!withBacking || !hasAudio) return null
    const ref = referenceVocals.find((r) => r.voicePart === voicePart) ?? referenceVocals[0]
    if (recordingAudioMode === 'vocals_only' && ref?.isolatedFileUrl) return ref.isolatedFileUrl
    if (recordingAudioMode === 'music_only' && ref?.accompanimentFileUrl) return ref.accompanimentFileUrl
    return backingTrackUrl ?? null
  }, [withBacking, hasAudio, recordingAudioMode, referenceVocals, voicePart, backingTrackUrl])

  const hasVocalsOnly = referenceVocals.some((r) => !!r.isolatedFileUrl)
  const hasMusicOnly = referenceVocals.some((r) => !!r.accompanimentFileUrl)

  // Reference vocal URL for comparison playback (from the song, not the user's recording)
  const refVocalUrl = useMemo(() => {
    const ref = referenceVocals.find((r) => r.voicePart === voicePart) ?? referenceVocals[0]
    return ref?.isolatedFileUrl || null
  }, [referenceVocals, voicePart])

  // Pre-fetch backing track as ArrayBuffer for Web Audio API playback
  const [backingBuffer, setBackingBuffer] = useState<ArrayBuffer | null>(null)
  const [backingLoading, setBackingLoading] = useState(false)
  useEffect(() => {
    if (!isOpen || !effectiveBackingUrl || !withBacking) {
      setBackingBuffer(null)
      setBackingLoading(false)
      return
    }
    setBackingLoading(true)
    fetch(effectiveBackingUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then(buf => {
        setBackingBuffer(buf)
        setBackingLoading(false)
      })
      .catch((err) => {
        console.warn('[ChunkRecording] Failed to fetch backing track:', err)
        setBackingBuffer(null)
        setBackingLoading(false)
      })
  }, [isOpen, effectiveBackingUrl, withBacking])

  const recorder = useVocalRecorder({
    backingTrackBuffer: withBacking && hasAudio ? backingBuffer : null,
    useHeadphones,
    deviceId: micDeviceId,
  })

  // Keep recording blob URL for playback in results
  const [recordingBlobUrl, setRecordingBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (recorder.audioBlob) {
      const url = URL.createObjectURL(recorder.audioBlob)
      setRecordingBlobUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setRecordingBlobUrl(null)
  }, [recorder.audioBlob])

  // Audio refs for snippet playback in problem areas
  const userAudioRef = useRef<HTMLAudioElement | null>(null)
  const refAudioRef = useRef<HTMLAudioElement | null>(null)
  const snippetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const playSnippet = useCallback((
    audioRef: React.RefObject<HTMLAudioElement | null>,
    startTime: number,
    endTime: number,
  ) => {
    const el = audioRef.current
    if (!el) return
    // Stop any previously playing snippet
    if (snippetTimerRef.current) clearTimeout(snippetTimerRef.current)
    userAudioRef.current?.pause()
    refAudioRef.current?.pause()
    // Seek and play
    el.currentTime = startTime
    el.play()
    const durationMs = (endTime - startTime) * 1000 + 300 // small buffer
    snippetTimerRef.current = setTimeout(() => el.pause(), durationMs)
  }, [])

  // withBacking defaults to true — user can toggle manually
  const [jobId, setJobId] = useState<string | null>(null)
  const [serverStage, setServerStage] = useState<string | null>(null)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('ready')
      setJobId(null)
      setServerStage(null)
      setResult(null)
      setErrorMsg(null)
      setRecordingBlobUrl(null)
      recorder.reset()
      if (pollRef.current) clearInterval(pollRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Start recording — backing track is played through the same AudioContext by the hook
  const handleStartRecording = useCallback(async () => {
    setErrorMsg(null)

    try {
      await recorder.startRecording()
    } catch {
      setErrorMsg('לא ניתן להפעיל מיקרופון')
      return
    }

    setStep('recording')
  }, [recorder])

  // Stop recording — backing track is stopped by the hook
  const handleStopRecording = useCallback(() => {
    recorder.stopRecording()
    audioActions?.pause()
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

        // Upload via server-side proxy (avoids S3 CORS issues)
        const formData = new FormData()
        formData.append('file', blob, `chunk-${chunk.id}.webm`)
        formData.append('songId', songId)
        formData.append('voicePart', voicePart)

        const uploadRes = await fetch('/api/vocal-analysis/upload', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}))
          throw new Error(errData.error || `Upload failed (${uploadRes.status})`)
        }
        const { key } = await uploadRes.json()

        // Create analysis job
        const jobRes = await fetch('/api/vocal-analysis/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId,
            voicePart,
            recordingS3Key: key,
            recordingDurationMs: recorder.durationMs,
            useHeadphones,
          }),
          signal: controller.signal,
        })
        if (!jobRes.ok) {
          const err = await jobRes.json().catch(() => ({}))
          throw new Error(err.error || `Job failed (${jobRes.status})`)
        }
        const data = await jobRes.json()
        const job = data.job ?? data

        // If already completed (mock mode), show results immediately
        if (job.status === 'COMPLETED' && job.practiceSession) {
          const ps = job.practiceSession

          setResult(parsePracticeSession(ps))
          setStep('results')
          return
        }

        setJobId(job.id)
        setServerStage('uploading')
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
    const maxAttempts = 100 // ~5 min timeout

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

        // Update progress stage from server
        if (job.stage) setServerStage(job.stage)

        if (job.status === 'COMPLETED' && job.practiceSession) {
          const ps = job.practiceSession

          setResult(parsePracticeSession(ps))
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
    <Modal isOpen={isOpen} onClose={onClose} title={`${chunk.label}`} resizable>
      <div className="space-y-4">
        {/* Chunk lyrics */}
        <div
          className="rounded-lg bg-border/10 p-3 max-h-48 overflow-y-auto"
          dir={textDirection === 'rtl' ? 'rtl' : textDirection === 'ltr' ? 'ltr' : 'auto'}
        >
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {chunk.lyrics}
          </p>
        </div>

        {/* ==================== Ready ==================== */}
        {step === 'ready' && (
          <div className="space-y-4">
            {/* Microphone selector */}
            <MicSelector selectedDeviceId={micDeviceId} onSelect={setMicDeviceId} />

            {/* Headphones toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useHeadphones}
                onChange={(e) => setUseHeadphones(e.target.checked)}
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
              />
              <div>
                <span className="text-sm font-medium text-foreground">
                  {'🎧 אני עם אוזניות'}
                </span>
                <p className="text-xs text-text-muted">
                  {'מדלג על הפרדת קול (ניתוח מהיר יותר)'}
                </p>
              </div>
            </label>

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

            {/* Audio mode selector for backing track */}
            {withBacking && hasAudio && (hasVocalsOnly || hasMusicOnly) && (
              <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1">
                {([
                  { key: 'full_mix' as const, label: 'שיר מלא', available: true },
                  { key: 'vocals_only' as const, label: 'קול בלבד', available: hasVocalsOnly },
                  { key: 'music_only' as const, label: 'מוזיקה בלבד', available: hasMusicOnly },
                ]).map(({ key, label, available }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={!available}
                    onClick={() => setRecordingAudioMode(key)}
                    className={[
                      'rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                      recordingAudioMode === key
                        ? 'bg-primary text-white'
                        : available
                          ? 'text-text-muted hover:bg-surface-hover'
                          : 'text-text-muted/40 cursor-not-allowed',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {errorMsg && (
              <p className="text-sm text-danger text-center">{errorMsg}</p>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleStartRecording}
              disabled={withBacking && hasAudio && backingLoading}
            >
              {withBacking && hasAudio && backingLoading
                ? 'טוען מוזיקת רקע...'
                : 'התחילו הקלטה'}
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
              <p className={`text-xs ${recorder.backingPlaying ? 'text-secondary' : 'text-text-muted'}`}>
                {recorder.backingPlaying
                  ? '♫ מוזיקה מנגנת ברקע'
                  : backingBuffer
                    ? 'מוזיקת רקע לא הצליחה להתנגן'
                    : 'מוזיקת רקע לא נטענה'}
              </p>
            )}

            {errorMsg && (
              <p className="text-xs text-danger text-center">{errorMsg}</p>
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
          <AnalyzingProgress
            stage={serverStage}
            useHeadphones={useHeadphones}
            onCancel={() => {
              if (pollRef.current) clearInterval(pollRef.current)
              setStep('ready')
              recorder.reset()
            }}
          />
        )}

        {/* ==================== Results ==================== */}
        {step === 'results' && result && (
          <div className="space-y-4">
            {result.isMock && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-center">
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  {'ניתוח דמו: שירות הניתוח הקולי לא זמין כרגע. הציונים אינם מבוססים על ההקלטה.'}
                </p>
              </div>
            )}

            {/* Score + XP */}
            <div className="flex flex-col items-center gap-2">
              <ScoreDial score={result.overallScore} size="md" />
              <p className="text-xs text-text-muted">
                {'+' + result.xpEarned + ' XP'}
              </p>
            </div>

            {/* Per-second heatmap — which seconds were good/bad */}
            {result.sectionScores.length > 0 && (
              <SectionTimeline
                sections={result.sectionScores.map(s => ({
                  score: s.overallScore,
                  pitchScore: s.pitchScore,
                  timingScore: s.timingScore,
                  dynamicsScore: s.dynamicsScore,
                  refNote: s.refNote ?? null,
                  userNote: s.userNote ?? null,
                  noteMatch: s.noteMatch ?? null,
                  pitchClassMatch: s.pitchClassMatch ?? null,
                  octaveDiff: s.octaveDiff ?? null,
                  startMs: s.startTime * 1000,
                  endMs: s.endTime * 1000,
                }))}
                totalDurationMs={
                  result.sectionScores[result.sectionScores.length - 1].endTime * 1000
                }
                refAudioUrl={refVocalUrl || result.isolatedVocalUrl}
                userAudioUrl={useHeadphones ? (recordingBlobUrl || result.originalRecordingUrl) : (result.isolatedVocalUrl || recordingBlobUrl)}
                noteComparison={result.noteComparison}
                lyricLines={chunk.lyrics.split('\n').filter(Boolean)}
                lineTimestamps={chunk.lineTimestamps ? (() => {
                  // lineTimestamps are absolute to song; subtract chunk start to get 0-based
                  const offset = chunk.audioStartMs ?? chunk.lineTimestamps![0] ?? 0
                  return chunk.lineTimestamps!.map(t => t - offset)
                })() : undefined}
              />
            )}

            {/* Hidden audio elements for snippet playback */}
            {(refVocalUrl || result.isolatedVocalUrl) && (
              <audio ref={refAudioRef} src={refVocalUrl || result.isolatedVocalUrl || ''} preload="auto" className="hidden" />
            )}
            {(recordingBlobUrl || result.originalRecordingUrl || result.isolatedVocalUrl) && (
              <audio
                ref={userAudioRef}
                src={useHeadphones ? (recordingBlobUrl || result.originalRecordingUrl!) : (result.isolatedVocalUrl || recordingBlobUrl!)}
                preload="auto"
                className="hidden"
              />
            )}

            {/* Side-by-side comparison: reference vocal vs your recording */}
            {(refVocalUrl || recordingBlobUrl) && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{'השוואת ביצוע'}</h3>
                {refVocalUrl && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">{'קול ייחוס (מבודד מהשיר)'}</p>
                    <audio
                      controls
                      src={refVocalUrl}
                      className="w-full h-10"
                      preload="metadata"
                    />
                  </div>
                )}
                {(useHeadphones ? (recordingBlobUrl || result.originalRecordingUrl) : result.isolatedVocalUrl || recordingBlobUrl) && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">
                      {useHeadphones ? 'ההקלטה שלך (מקור)' : 'הקול שלך (מבודד)'}
                    </p>
                    <audio
                      controls
                      src={useHeadphones ? (recordingBlobUrl || result.originalRecordingUrl!) : (result.isolatedVocalUrl || recordingBlobUrl!)}
                      className="w-full h-10"
                      preload="auto"
                      onLoadedMetadata={(e) => {
                        const el = e.currentTarget
                        if (!isFinite(el.duration)) {
                          el.currentTime = 1e101
                          el.ontimeupdate = () => { el.ontimeupdate = null; el.currentTime = 0 }
                        }
                      }}
                    />
                  </div>
                )}
                {useHeadphones && result.isolatedVocalUrl && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">
                      {'ההקלטה שלך (WAV מומר - להשוואה)'}
                    </p>
                    <audio
                      controls
                      src={result.isolatedVocalUrl}
                      className="w-full h-10"
                      preload="metadata"
                    />
                  </div>
                )}
              </div>
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
