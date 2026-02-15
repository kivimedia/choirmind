'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ScoreDial from './ScoreDial'
import SectionTimeline from './SectionTimeline'
import AudioModeSelector, { type AudioMode } from '@/components/audio/AudioModeSelector'
import KaraokeDisplay from '@/components/practice/KaraokeDisplay'
import FadeOutDisplay from '@/components/practice/FadeOutDisplay'
import { useVocalRecorder } from '@/hooks/useVocalRecorder'
import MicSelector from './MicSelector'
import { computeChunkBoundaries, getActiveChunkIndex } from '@/lib/chunk-boundaries'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkInfo {
  id: string
  label: string
  lyrics: string
  lineTimestamps?: number[] | null
  audioStartMs?: number | null
  audioEndMs?: number | null
}

interface ReferenceVocal {
  id: string
  voicePart: string
  isolatedFileUrl: string | null
  accompanimentFileUrl?: string | null
  durationMs: number
}

interface AudioTrack {
  id: string
  voicePart: string
  fileUrl: string
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

interface FullSongRecordingPanelProps {
  isOpen: boolean
  onClose: () => void
  songId: string
  songTitle: string
  chunks: ChunkInfo[]
  voicePart: string
  textDirection: string
  audioTracks: AudioTrack[]
  referenceVocals: ReferenceVocal[]
}

type Step = 'ready' | 'recording' | 'uploading' | 'analyzing' | 'results'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function MiniWaveform({ data }: { data: Uint8Array | null }) {
  if (!data) return <div className="h-12" />
  const bars = 32
  const step = Math.floor(data.length / bars)
  const values: number[] = []
  for (let i = 0; i < bars; i++) {
    const val = data[i * step] ?? 128
    values.push(Math.abs(val - 128) / 128)
  }
  return (
    <div className="flex items-center justify-center gap-0.5 h-12">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-primary transition-all duration-75"
          style={{ height: `${Math.max(4, v * 48)}px` }}
        />
      ))}
    </div>
  )
}

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
// Analyzing progress
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

  const activeStep = ANALYSIS_STAGES.findIndex((s) => s.key === resolvedStageKey)
  const effectiveStep = activeStep >= 0 ? activeStep : 0

  return (
    <div className="space-y-4 py-2">
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
      <p className="text-center text-xs text-text-muted tabular-nums" dir="ltr">{Math.floor(elapsed / 1000)}s</p>
      <button onClick={onCancel} className="mx-auto block text-xs text-text-muted hover:text-foreground">
        ביטול
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FullSongRecordingPanel({
  isOpen,
  onClose,
  songId,
  songTitle,
  chunks,
  voicePart,
  textDirection,
  audioTracks,
  referenceVocals,
}: FullSongRecordingPanelProps) {
  const [step, setStep] = useState<Step>('ready')
  const [audioMode, setAudioMode] = useState<AudioMode>('full_mix')
  const [useHeadphones, setUseHeadphones] = useState(false)
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null)

  // Resolve backing track URL based on audio mode
  const backingTrackUrl = useMemo(() => {
    if (audioMode === 'vocals_only') {
      const match = referenceVocals.find((r) => r.voicePart === voicePart && r.isolatedFileUrl)
        ?? referenceVocals.find((r) => r.isolatedFileUrl)
      return match?.isolatedFileUrl ?? null
    }
    if (audioMode === 'music_only') {
      const match = referenceVocals.find((r) => r.voicePart === voicePart && r.accompanimentFileUrl)
        ?? referenceVocals.find((r) => r.accompanimentFileUrl)
      return match?.accompanimentFileUrl ?? null
    }
    // full_mix: use uploaded audio tracks
    const track = audioTracks.find((t) => t.voicePart === voicePart)
      ?? audioTracks.find((t) => ['mix', 'playback', 'full'].includes(t.voicePart))
      ?? audioTracks[0]
    return track?.fileUrl ?? null
  }, [audioMode, audioTracks, referenceVocals, voicePart])

  // Pre-fetch backing track as ArrayBuffer
  const [backingBuffer, setBackingBuffer] = useState<ArrayBuffer | null>(null)
  const [backingLoading, setBackingLoading] = useState(false)
  useEffect(() => {
    if (!isOpen || !backingTrackUrl) {
      setBackingBuffer(null)
      setBackingLoading(false)
      return
    }
    setBackingLoading(true)
    fetch(backingTrackUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        setBackingBuffer(buf)
        setBackingLoading(false)
      })
      .catch(() => {
        setBackingBuffer(null)
        setBackingLoading(false)
      })
  }, [isOpen, backingTrackUrl])

  const recorder = useVocalRecorder({
    backingTrackBuffer: backingTrackUrl ? backingBuffer : null,
    useHeadphones,
    deviceId: micDeviceId,
  })

  // Reference vocal URL (the actual song's isolated vocal for this voice part)
  const refVocalUrl = useMemo(() => {
    const ref = referenceVocals.find((r) => r.voicePart === voicePart && r.isolatedFileUrl)
      ?? referenceVocals.find((r) => r.isolatedFileUrl)
    return ref?.isolatedFileUrl || null
  }, [referenceVocals, voicePart])

  // Recording blob URL for playback
  const [recordingBlobUrl, setRecordingBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (recorder.audioBlob) {
      const url = URL.createObjectURL(recorder.audioBlob)
      setRecordingBlobUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setRecordingBlobUrl(null)
  }, [recorder.audioBlob])

  // Auto-advancing lyrics during recording
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const recordStartRef = useRef(0)
  const animFrameRef = useRef(0)

  const boundaries = useMemo(() => {
    if (chunks.length === 0) return []
    // Estimate total duration from last chunk
    const last = chunks[chunks.length - 1]
    let totalMs = 0
    if (last.audioEndMs) {
      totalMs = last.audioEndMs
    } else if (last.lineTimestamps?.length) {
      totalMs = last.lineTimestamps[last.lineTimestamps.length - 1] + 30000
    } else {
      totalMs = 300000 // 5 min fallback
    }
    return computeChunkBoundaries(chunks, totalMs)
  }, [chunks])

  // Track elapsed time during recording for lyrics auto-advance
  useEffect(() => {
    if (step !== 'recording' || !recorder.isRecording) return

    recordStartRef.current = Date.now() - elapsedMs

    function tick() {
      const ms = Date.now() - recordStartRef.current
      setElapsedMs(ms)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, recorder.isRecording])

  // Auto-advance chunk based on elapsed time
  useEffect(() => {
    if (step !== 'recording' || boundaries.length === 0) return
    const idx = getActiveChunkIndex(boundaries, elapsedMs)
    if (idx !== currentChunkIndex) {
      setCurrentChunkIndex(idx)
    }
  }, [elapsedMs, boundaries, currentChunkIndex, step])

  const currentChunk = chunks[currentChunkIndex] ?? null

  // Job state
  const [jobId, setJobId] = useState<string | null>(null)
  const [serverStage, setServerStage] = useState<string | null>(null)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Audio mode availability
  const audioModeAvailable = useMemo(() => ({
    fullMix: audioTracks.length > 0,
    vocalsOnly: referenceVocals.some((r) => !!r.isolatedFileUrl),
    musicOnly: referenceVocals.some((r) => !!r.accompanimentFileUrl),
  }), [audioTracks, referenceVocals])

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('ready')
      setJobId(null)
      setServerStage(null)
      setResult(null)
      setErrorMsg(null)
      setRecordingBlobUrl(null)
      setCurrentChunkIndex(0)
      setElapsedMs(0)
      recorder.reset()
      if (pollRef.current) clearInterval(pollRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleStartRecording = useCallback(async () => {
    setErrorMsg(null)
    setCurrentChunkIndex(0)
    setElapsedMs(0)

    try {
      await recorder.startRecording()
    } catch {
      setErrorMsg('לא ניתן להפעיל מיקרופון')
      return
    }

    setStep('recording')
  }, [recorder])

  const handleStopRecording = useCallback(() => {
    recorder.stopRecording()
  }, [recorder])

  // Upload + create job when blob is ready
  useEffect(() => {
    if (!recorder.audioBlob || step !== 'recording') return

    const controller = new AbortController()
    abortRef.current = controller

    async function uploadAndSubmit() {
      setStep('uploading')
      try {
        const blob = recorder.audioBlob!

        const formData = new FormData()
        formData.append('file', blob, `fullsong-${songId}.webm`)
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

        if (job.status === 'COMPLETED' && job.practiceSession) {
          setResult(parsePracticeSession(job.practiceSession))
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
    const maxAttempts = 200

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
          setResult(parsePracticeSession(job.practiceSession))
          setStep('results')
          if (pollRef.current) clearInterval(pollRef.current)
        } else if (job.status === 'FAILED') {
          setErrorMsg(job.errorMessage || 'הניתוח נכשל')
          setStep('ready')
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {
        // Retry
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
    <Modal isOpen={isOpen} onClose={onClose} title={`הקלטת שיר מלא: ${songTitle}`} resizable className="max-w-2xl">
      <div className="space-y-4">
        {/* ==================== Ready ==================== */}
        {step === 'ready' && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              הקליטו את כל השיר מתחילתו ועד סופו. המילים יתקדמו אוטומטית בזמן ההקלטה.
            </p>
            <p className="text-xs text-text-muted/70">
              הקלטה עד 10 דקות. ניתוח לוקח 2-5 דקות.
            </p>

            {/* Audio mode selector */}
            {(audioModeAvailable.vocalsOnly || audioModeAvailable.musicOnly) && (
              <div>
                <p className="text-xs text-text-muted mb-2">בחרו מוזיקת רקע:</p>
                <AudioModeSelector
                  available={audioModeAvailable}
                  selected={audioMode}
                  onChange={setAudioMode}
                />
              </div>
            )}

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

            {errorMsg && (
              <p className="text-sm text-danger text-center">{errorMsg}</p>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleStartRecording}
              disabled={backingLoading}
            >
              {backingLoading ? 'טוען מוזיקת רקע...' : 'התחילו הקלטה'}
            </Button>
          </div>
        )}

        {/* ==================== Recording ==================== */}
        {step === 'recording' && (
          <div className="space-y-4">
            {/* Header: elapsed time + chunk progress */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-danger animate-pulse" />
                <span className="text-lg font-bold tabular-nums" dir="ltr">
                  {formatTime(elapsedMs)}
                </span>
              </div>
              <span className="text-xs text-text-muted">
                {currentChunk?.label} ({currentChunkIndex + 1}/{chunks.length})
              </span>
            </div>

            {/* Waveform */}
            <MiniWaveform data={recorder.analyserData} />

            {/* Backing track status */}
            {backingTrackUrl && (
              <p className={`text-xs text-center ${recorder.backingPlaying ? 'text-secondary' : 'text-text-muted'}`}>
                {recorder.backingPlaying ? '♫ מוזיקה מנגנת ברקע' : 'מוזיקת רקע לא הצליחה להתנגן'}
              </p>
            )}

            {/* Chunk progress dots */}
            <div className="flex items-center justify-center gap-1">
              {chunks.map((_, i) => (
                <div
                  key={i}
                  className={[
                    'h-2 rounded-full transition-all duration-300',
                    i === currentChunkIndex
                      ? 'w-5 bg-primary'
                      : i < currentChunkIndex
                        ? 'w-2 bg-primary/40'
                        : 'w-2 bg-border',
                  ].join(' ')}
                />
              ))}
            </div>

            {/* Auto-advancing lyrics */}
            {currentChunk && (
              <div
                className="rounded-xl border border-border bg-surface p-4 max-h-64 overflow-y-auto"
                dir={textDirection === 'rtl' ? 'rtl' : textDirection === 'ltr' ? 'ltr' : 'auto'}
              >
                <p className="text-xs font-semibold text-primary mb-2">{currentChunk.label}</p>
                {currentChunk.lineTimestamps ? (
                  <KaraokeDisplay
                    lyrics={currentChunk.lyrics}
                    fadeLevel={0}
                    timestamps={currentChunk.lineTimestamps}
                    currentTimeMs={elapsedMs}
                    onWordReveal={() => {}}
                    onLineClick={() => {}}
                  />
                ) : (
                  <FadeOutDisplay
                    lyrics={currentChunk.lyrics}
                    fadeLevel={0}
                    onWordReveal={() => {}}
                  />
                )}
              </div>
            )}

            {/* Stop button */}
            <div className="flex justify-center">
              <button
                onClick={handleStopRecording}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                aria-label="עצור הקלטה"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ==================== Uploading ==================== */}
        {step === 'uploading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-foreground">מעלה ומנתח...</p>
            <button
              onClick={() => {
                if (abortRef.current) abortRef.current.abort()
                setErrorMsg('ההעלאה בוטלה')
                setStep('ready')
              }}
              className="text-xs text-text-muted hover:text-foreground"
            >
              ביטול
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
                  ניתוח דמו: שירות הניתוח הקולי לא זמין כרגע. הציונים אינם מבוססים על ההקלטה.
                </p>
              </div>
            )}

            {/* Score + XP */}
            <div className="flex flex-col items-center gap-2">
              <ScoreDial score={result.overallScore} size="md" />
              <p className="text-xs text-text-muted">
                +{result.xpEarned} XP
              </p>
            </div>

            {/* Per-second heatmap — which seconds were good/bad */}
            {result.sectionScores.length > 0 && (
              <SectionTimeline
                sections={result.sectionScores.map((s) => ({
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
                refAudioUrl={refVocalUrl}
                userAudioUrl={useHeadphones ? (recordingBlobUrl || result.originalRecordingUrl) : (result.isolatedVocalUrl || recordingBlobUrl)}
                noteComparison={result.noteComparison}
                lyricLines={chunks.flatMap(c => c.lyrics.split('\n').filter(Boolean))}
                lineTimestamps={chunks.flatMap(c => c.lineTimestamps ?? [])}
              />
            )}

            {/* Side-by-side comparison: reference vocal vs your recording */}
            {(refVocalUrl || result.isolatedVocalUrl || recordingBlobUrl) && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">השוואת ביצוע</h3>
                {refVocalUrl && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">קול ייחוס (מבודד מהשיר)</p>
                    <audio controls src={refVocalUrl} className="w-full h-10" preload="metadata" />
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
                  setCurrentChunkIndex(0)
                  setElapsedMs(0)
                  setStep('ready')
                }}
              >
                הקליטו שוב
              </Button>
              <Button
                variant="outline"
                size="md"
                className="flex-1"
                onClick={onClose}
              >
                סיום
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
