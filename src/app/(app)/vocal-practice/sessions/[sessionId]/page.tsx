'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import ScoreDial from '@/components/vocal/ScoreDial'
import SectionTimeline from '@/components/vocal/SectionTimeline'
import ProgressBar from '@/components/ui/ProgressBar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface ChunkData {
  id: string
  lyrics: string
  lineTimestamps: string | null
}

interface QuotaData {
  freeSecondsUsed: number
  totalAllowance: number
  hasChoirSubscription: boolean
}

const VOICE_PART_HE: Record<string, string> = {
  soprano: 'סופרן',
  mezzo: 'מצו',
  alto: 'אלט',
  tenor: 'טנור',
  baritone: 'בריטון',
  bass: 'בס',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseSectionScores(raw: string) {
  let sections: SectionScoreData[] = []
  let isolatedVocalUrl: string | undefined
  let originalRecordingUrl: string | undefined
  let noteComparison: NoteComparisonData[] = []

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      sections = parsed
    } else if (parsed.sections) {
      sections = parsed.sections
      isolatedVocalUrl = parsed.isolatedVocalUrl
      originalRecordingUrl = parsed.originalRecordingUrl
    }
    if (!Array.isArray(parsed) && parsed.noteComparison) {
      noteComparison = parsed.noteComparison
    }
  } catch {}

  return { sections, isolatedVocalUrl, originalRecordingUrl, noteComparison }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()

  const [session, setSession] = useState<Record<string, unknown> | null>(null)
  const [chunks, setChunks] = useState<ChunkData[]>([])
  const [quota, setQuota] = useState<QuotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/vocal-analysis/sessions/${sessionId}`)
        if (!res.ok) {
          setError(res.status === 404 ? 'סשן לא נמצא' : res.status === 403 ? 'אין הרשאה' : 'שגיאה בטעינה')
          return
        }
        const data = await res.json()
        const s = data.session
        setSession(s)

        // Fetch song chunks for lyrics & timestamps, and quota in parallel
        const [chunksRes, quotaRes] = await Promise.allSettled([
          fetch(`/api/songs/${s.songId}`),
          fetch('/api/vocal-analysis/quota'),
        ])

        if (chunksRes.status === 'fulfilled' && chunksRes.value.ok) {
          const songData = await chunksRes.value.json()
          setChunks(songData.song?.chunks ?? [])
        }
        if (quotaRes.status === 'fulfilled' && quotaRes.value.ok) {
          const q = await quotaRes.value.json()
          setQuota(q)
        }
      } catch {
        setError('שגיאה בטעינה')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sessionId])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-32 rounded bg-border/40" />
        <div className="h-32 rounded-xl bg-border/30" />
        <div className="h-48 rounded-xl bg-border/30" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Card>
          <div className="py-8 text-center space-y-2">
            <p className="text-foreground font-medium">{error || 'סשן לא נמצא'}</p>
            <Link href="/vocal-practice/history" className="text-sm text-primary hover:underline">
              חזרה להיסטוריה
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // Parse session data
  const songTitle = (session.song as { title?: string })?.title ?? 'שיר'
  const songId = session.songId as string
  const voicePart = session.voicePart as string
  const overallScore = session.overallScore as number
  const pitchScore = session.pitchScore as number
  const timingScore = session.timingScore as number
  const dynamicsScore = session.dynamicsScore as number
  const createdAt = new Date(session.createdAt as string)

  let coachingTips: string[] = []
  try { coachingTips = JSON.parse((session.coachingTips as string) || '[]') } catch {}

  const { sections, isolatedVocalUrl, originalRecordingUrl, noteComparison } =
    parseSectionScores((session.sectionScores as string) || '[]')

  // Lyric lines & timestamps from chunks
  const lyricLines = chunks.flatMap(c => c.lyrics.split('\n').filter(Boolean))
  const lineTimestamps = (() => {
    const allTs = chunks.flatMap(c => {
      try { return JSON.parse(c.lineTimestamps || '[]') } catch { return [] }
    })
    const offset = allTs.length > 0 ? allTs[0] : 0
    return allTs.map((t: number) => t - offset)
  })()

  // Ref audio URL: isolated vocal from analysis
  const refAudioUrl = isolatedVocalUrl || null
  const userAudioUrl = originalRecordingUrl || null

  // Quota bar
  const quotaPct = quota ? Math.min(100, Math.round((quota.freeSecondsUsed / quota.totalAllowance) * 100)) : 0
  const quotaStatus: 'solid' | 'developing' | 'shaky' | 'fragile' =
    quotaPct < 50 ? 'solid' : quotaPct < 70 ? 'developing' : quotaPct < 90 ? 'shaky' : 'fragile'

  return (
    <div className="space-y-6">
      {/* Header: back + song info */}
      <div>
        <Link
          href="/vocal-practice/history"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1 mb-2"
        >
          → חזרה להיסטוריה
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{songTitle}</h1>
        <p className="text-sm text-text-muted">
          {VOICE_PART_HE[voicePart] ?? voicePart}
          {' · '}
          {createdAt.toLocaleDateString('he-IL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {/* Scores */}
      <Card>
        <div className="flex flex-col items-center gap-4">
          <ScoreDial score={overallScore} size="lg" />
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-lg font-bold text-foreground tabular-nums" dir="ltr">{Math.round(pitchScore)}</p>
              <p className="text-xs text-text-muted">גובה</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground tabular-nums" dir="ltr">{Math.round(timingScore)}</p>
              <p className="text-xs text-text-muted">תזמון</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground tabular-nums" dir="ltr">{Math.round(dynamicsScore)}</p>
              <p className="text-xs text-text-muted">דינמיקה</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Quota bar */}
      {quota && (
        <Card>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">קרדיט ניתוח קולי</span>
              {quota.hasChoirSubscription ? (
                <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  ללא הגבלה
                </span>
              ) : (
                <span className="text-foreground font-medium tabular-nums" dir="ltr">
                  {formatSeconds(quota.freeSecondsUsed)} / {formatSeconds(quota.totalAllowance)}
                </span>
              )}
            </div>
            {!quota.hasChoirSubscription && (
              <ProgressBar value={quotaPct} size="sm" status={quotaStatus} />
            )}
          </div>
        </Card>
      )}

      {/* Section Timeline — heatmap + note comparison */}
      {sections.length > 0 && (
        <Card header={<h2 className="text-sm font-semibold text-foreground">ניתוח מפורט</h2>}>
          <SectionTimeline
            sections={sections.map((s) => ({
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
            totalDurationMs={sections[sections.length - 1].endTime * 1000}
            refAudioUrl={refAudioUrl}
            userAudioUrl={userAudioUrl}
            noteComparison={noteComparison}
            lyricLines={lyricLines}
            lineTimestamps={lineTimestamps}
          />
        </Card>
      )}

      {/* Audio players */}
      {(refAudioUrl || userAudioUrl) && (
        <Card header={<h2 className="text-sm font-semibold text-foreground">השוואת ביצוע</h2>}>
          <div className="space-y-3">
            {refAudioUrl && (
              <div>
                <p className="text-xs text-text-muted mb-1">קול ייחוס (מבודד מהשיר)</p>
                <audio controls src={refAudioUrl} className="w-full h-10" preload="metadata" />
              </div>
            )}
            {userAudioUrl && (
              <div>
                <p className="text-xs text-text-muted mb-1">ההקלטה שלך</p>
                <audio
                  controls
                  src={userAudioUrl}
                  className="w-full h-10"
                  preload="metadata"
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
          </div>
        </Card>
      )}

      {/* Coaching tips */}
      {coachingTips.length > 0 && (
        <Card header={<h2 className="text-sm font-semibold text-foreground">טיפים לשיפור</h2>}>
          <ul className="space-y-2">
            {coachingTips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="shrink-0 text-primary">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Record again */}
      <div className="flex justify-center">
        <Link
          href={`/songs/${songId}`}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          הקליטו שוב
        </Link>
      </div>
    </div>
  )
}
