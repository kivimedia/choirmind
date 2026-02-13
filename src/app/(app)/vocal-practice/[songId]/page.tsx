'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import VocalRecorder from '@/components/vocal/VocalRecorder'
import AnalysisStatus from '@/components/vocal/AnalysisStatus'
import ScoreDial from '@/components/vocal/ScoreDial'
import ScoreBreakdown from '@/components/vocal/ScoreBreakdown'
import SectionTimeline from '@/components/vocal/SectionTimeline'
import CoachingTipCard from '@/components/vocal/CoachingTipCard'
import VocalQuotaBanner from '@/components/vocal/VocalQuotaBanner'
import { useVocalRecorder } from '@/hooks/useVocalRecorder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowStep = 'setup' | 'recording' | 'uploading' | 'analyzing' | 'results'

interface SongInfo {
  id: string
  title: string
  composer?: string
  audioTracks: { id: string; voicePart: string }[]
}

interface QuotaInfo {
  freeSecondsUsed: number
  freeSecondsLimit: number
  freeSecondsRemaining: number
}

interface SessionResult {
  overallScore: number
  pitchScore: number
  timingScore: number
  dynamicsScore: number
  sectionScores: { label: string; score: number; startMs: number; endMs: number }[]
  problemAreas: { description: string; startMs: number; endMs: number }[]
  coachingTips: string[]
  xpEarned: number
  durationMs: number
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function VocalPracticePage({
  params,
}: {
  params: Promise<{ songId: string }>
}) {
  const { songId } = use(params)
  const { data: session } = useSession()
  const recorder = useVocalRecorder()

  const [step, setStep] = useState<FlowStep>('setup')
  const [song, setSong] = useState<SongInfo | null>(null)
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [useHeadphones, setUseHeadphones] = useState(true)
  const [selectedVoicePart, setSelectedVoicePart] = useState<string>('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('PENDING')
  const [jobError, setJobError] = useState<string | null>(null)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Fetch song info + quota on mount
  useEffect(() => {
    async function fetchData() {
      const [songRes, quotaRes] = await Promise.allSettled([
        fetch(`/api/songs/${songId}`),
        fetch('/api/vocal-analysis/quota'),
      ])

      if (songRes.status === 'fulfilled' && songRes.value.ok) {
        const data = await songRes.value.json()
        setSong(data.song ?? data)
        // Default voice part from user's setting
        if (session?.user) {
          setSelectedVoicePart(
            (session.user as Record<string, string>).voicePart ?? 'soprano'
          )
        }
      }

      if (quotaRes.status === 'fulfilled' && quotaRes.value.ok) {
        const data = await quotaRes.value.json()
        setQuota(data)
      }
    }
    fetchData()
  }, [songId, session])

  // Poll job status when analyzing
  useEffect(() => {
    if (step !== 'analyzing' || !jobId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/vocal-analysis/jobs/${jobId}`)
        if (!res.ok) return
        const data = await res.json()
        const job = data.job ?? data

        setJobStatus(job.status)

        if (job.status === 'COMPLETED' && job.practiceSession) {
          const ps = job.practiceSession
          setResult({
            overallScore: ps.overallScore,
            pitchScore: ps.pitchScore,
            timingScore: ps.timingScore,
            dynamicsScore: ps.dynamicsScore,
            sectionScores: JSON.parse(ps.sectionScores || '[]'),
            problemAreas: JSON.parse(ps.problemAreas || '[]'),
            coachingTips: JSON.parse(ps.coachingTips || '[]'),
            xpEarned: ps.xpEarned,
            durationMs: ps.durationMs,
          })
          setStep('results')
          clearInterval(interval)
        } else if (job.status === 'FAILED') {
          setJobError(job.errorMessage || 'שגיאה לא ידועה')
          clearInterval(interval)
        }
      } catch {
        // Retry on next tick
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [step, jobId])

  // Upload + create job
  const handleRecordingComplete = useCallback(async () => {
    if (!recorder.audioBlob || !song) return

    setStep('uploading')
    setUploadError(null)

    try {
      // 1. Get presigned URL
      const ext = recorder.audioBlob.type.includes('webm') ? 'webm' : 'mp4'
      const presignRes = await fetch('/api/vocal-analysis/upload-presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          voicePart: selectedVoicePart,
          filename: `recording.${ext}`,
          contentType: recorder.audioBlob.type,
          durationMs: recorder.durationMs,
        }),
      })

      if (!presignRes.ok) {
        throw new Error('Failed to get upload URL')
      }

      const { uploadUrl, key } = await presignRes.json()

      // 2. Upload to S3
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: recorder.audioBlob,
        headers: { 'Content-Type': recorder.audioBlob.type },
      })

      if (!uploadRes.ok) {
        throw new Error('Upload failed')
      }

      // 3. Create analysis job
      const jobRes = await fetch('/api/vocal-analysis/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          voicePart: selectedVoicePart,
          recordingS3Key: key,
          recordingDurationMs: recorder.durationMs,
          useHeadphones,
        }),
      })

      if (!jobRes.ok) {
        const err = await jobRes.json()
        throw new Error(err.error || 'Failed to create job')
      }

      const job = await jobRes.json()
      setJobId(job.id)
      setJobStatus('PENDING')
      setStep('analyzing')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'שגיאה בהעלאת ההקלטה')
      setStep('recording')
    }
  }, [recorder.audioBlob, recorder.durationMs, song, songId, selectedVoicePart, useHeadphones])

  // Auto-upload when recording stops and we have a blob
  useEffect(() => {
    if (recorder.audioBlob && step === 'recording') {
      handleRecordingComplete()
    }
  }, [recorder.audioBlob, step, handleRecordingComplete])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!song) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-text-muted">{'טוען...'}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link href={`/songs/${songId}`} className="text-sm text-primary hover:underline">
          {'← חזרה לשיר'}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-foreground">
          {'תרגול קולי'}
        </h1>
        <p className="text-text-muted">{song.title}</p>
      </div>

      {/* Quota banner */}
      {quota && (
        <VocalQuotaBanner
          secondsUsed={quota.freeSecondsUsed}
          secondsLimit={quota.freeSecondsLimit}
        />
      )}

      {/* ==================== Setup Step ==================== */}
      {step === 'setup' && (
        <Card>
          <div className="space-y-4">
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
                  {'אני משתמש/ת באוזניות'}
                </span>
                <p className="text-xs text-text-muted">
                  {'אוזניות משפרות את דיוק הניתוח'}
                </p>
              </div>
            </label>

            {/* Voice part selector */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">
                {'קול'}
              </label>
              <select
                value={selectedVoicePart}
                onChange={(e) => setSelectedVoicePart(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="soprano">{'סופרן'}</option>
                <option value="mezzo">{'מצו'}</option>
                <option value="alto">{'אלט'}</option>
                <option value="tenor">{'טנור'}</option>
                <option value="baritone">{'בריטון'}</option>
                <option value="bass">{'בס'}</option>
              </select>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => setStep('recording')}
              disabled={quota?.freeSecondsRemaining === 0}
            >
              {'התחילו הקלטה'}
            </Button>
          </div>
        </Card>
      )}

      {/* ==================== Recording Step ==================== */}
      {step === 'recording' && (
        <Card>
          <VocalRecorder
            isRecording={recorder.isRecording}
            isPaused={recorder.isPaused}
            durationMs={recorder.durationMs}
            analyserData={recorder.analyserData}
            error={recorder.error || uploadError}
            onStart={recorder.startRecording}
            onStop={recorder.stopRecording}
            onPause={recorder.pauseRecording}
            onResume={recorder.resumeRecording}
          />
        </Card>
      )}

      {/* ==================== Uploading Step ==================== */}
      {step === 'uploading' && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-foreground font-medium">{'מעלה הקלטה...'}</p>
          </div>
        </Card>
      )}

      {/* ==================== Analyzing Step ==================== */}
      {step === 'analyzing' && (
        <Card>
          <AnalysisStatus status={jobStatus} errorMessage={jobError} />
          {jobStatus === 'FAILED' && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() => {
                  recorder.reset()
                  setStep('setup')
                  setJobId(null)
                  setJobError(null)
                }}
              >
                {'נסו שוב'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ==================== Results Step ==================== */}
      {step === 'results' && result && (
        <div className="space-y-4">
          {/* Overall score */}
          <Card>
            <div className="flex flex-col items-center gap-4">
              <ScoreDial score={result.overallScore} size="lg" />
              <div className="text-center">
                <p className="text-sm text-text-muted">
                  {'+' + result.xpEarned + ' XP'}
                </p>
              </div>
            </div>
          </Card>

          {/* Score breakdown */}
          <Card
            header={
              <h2 className="text-sm font-semibold text-foreground">
                {'פירוט ציונים'}
              </h2>
            }
          >
            <ScoreBreakdown
              pitchScore={result.pitchScore}
              timingScore={result.timingScore}
              dynamicsScore={result.dynamicsScore}
            />
          </Card>

          {/* Section timeline */}
          {result.sectionScores.length > 0 && (
            <Card>
              <SectionTimeline
                sections={result.sectionScores}
                totalDurationMs={result.durationMs}
              />
            </Card>
          )}

          {/* Coaching tips */}
          {result.coachingTips.length > 0 && (
            <Card>
              <CoachingTipCard tips={result.coachingTips} />
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                recorder.reset()
                setStep('setup')
                setResult(null)
                setJobId(null)
              }}
            >
              {'הקליטו שוב'}
            </Button>
            <Link href={`/songs/${songId}`} className="flex-1">
              <Button variant="outline" size="lg" className="w-full">
                {'חזרה לשיר'}
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
