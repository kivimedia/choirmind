'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import ScoreDial from '@/components/vocal/ScoreDial'
import ScoreHistoryChart from '@/components/dashboard/ScoreHistoryChart'
import ProgressBar from '@/components/ui/ProgressBar'

interface QuotaData {
  freeSecondsUsed: number
  totalAllowance: number
  hasChoirSubscription: boolean
}

interface VocalSession {
  id: string
  songId: string
  songTitle: string
  voicePart: string
  overallScore: number
  pitchScore: number
  timingScore: number
  dynamicsScore: number
  createdAt: string
  song?: { id: string; title: string }
}

const VOICE_PART_HE: Record<string, string> = {
  soprano: 'סופרן',
  mezzo: 'מצו',
  alto: 'אלט',
  tenor: 'טנור',
  baritone: 'בריטון',
  bass: 'בס',
}

export default function VocalHistoryPage() {
  const [sessions, setSessions] = useState<VocalSession[]>([])
  const [quota, setQuota] = useState<QuotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterSongId, setFilterSongId] = useState<string>('all')

  useEffect(() => {
    async function fetchData() {
      try {
        const [sessionsRes, quotaRes] = await Promise.allSettled([
          fetch('/api/vocal-analysis/sessions?limit=100'),
          fetch('/api/vocal-analysis/quota'),
        ])

        if (sessionsRes.status === 'fulfilled' && sessionsRes.value.ok) {
          const data = await sessionsRes.value.json()
          setSessions(
            (data.sessions ?? []).map((s: VocalSession & { song?: { id: string; title: string } }) => ({
              ...s,
              songId: s.song?.id ?? s.songId,
              songTitle: s.song?.title ?? s.songTitle,
            }))
          )
        }
        if (quotaRes.status === 'fulfilled' && quotaRes.value.ok) {
          const q = await quotaRes.value.json()
          setQuota(q)
        }
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Unique songs for filter dropdown
  const uniqueSongs = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sessions) {
      if (!map.has(s.songId)) map.set(s.songId, s.songTitle)
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [sessions])

  // Filtered sessions
  const filtered = useMemo(() => {
    if (filterSongId === 'all') return sessions
    return sessions.filter((s) => s.songId === filterSongId)
  }, [sessions, filterSongId])

  // Chart data (reversed for chronological)
  const chartData = useMemo(() => {
    return [...filtered].reverse().map((s) => ({
      date: s.createdAt,
      overallScore: s.overallScore,
      pitchScore: s.pitchScore,
      timingScore: s.timingScore,
      dynamicsScore: s.dynamicsScore,
    }))
  }, [filtered])

  // Score trend for filtered set
  const trend = useMemo(() => {
    if (filtered.length < 2) return null
    const recent = filtered.slice(0, 3)
    const older = filtered.slice(3, 6)
    if (older.length === 0) return null
    const recentAvg = recent.reduce((s, x) => s + x.overallScore, 0) / recent.length
    const olderAvg = older.reduce((s, x) => s + x.overallScore, 0) / older.length
    const diff = Math.round(recentAvg - olderAvg)
    return { up: diff >= 0, diff: Math.abs(diff), pct: Math.round((diff / Math.max(1, olderAvg)) * 100) }
  }, [filtered])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-border/40" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-border/30" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          היסטוריית תרגול קולי
        </h1>
        <p className="mt-1 text-text-muted">
          כל ההקלטות והציונים שלכם
        </p>
      </div>

      {/* Quota bar */}
      {quota && (
        <Card>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">קרדיט ניתוח קולי</span>
              <div className="flex items-center gap-2">
                {quota.hasChoirSubscription ? (
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    ללא הגבלה
                  </span>
                ) : (
                  <>
                    <span className="text-foreground font-medium tabular-nums" dir="ltr">
                      {Math.floor(quota.freeSecondsUsed / 60)}:{(quota.freeSecondsUsed % 60).toString().padStart(2, '0')}
                      {' / '}
                      {Math.floor(quota.totalAllowance / 60)}:{(quota.totalAllowance % 60).toString().padStart(2, '0')}
                      {' דקות'}
                    </span>
                    <Link
                      href="/pricing"
                      className="text-xs font-medium bg-primary text-white px-2.5 py-1 rounded-lg hover:bg-primary-dark transition-colors"
                    >
                      הוסיפו דקות
                    </Link>
                  </>
                )}
              </div>
            </div>
            {!quota.hasChoirSubscription && (() => {
              const pct = Math.min(100, Math.round((quota.freeSecondsUsed / quota.totalAllowance) * 100))
              const status: 'solid' | 'developing' | 'shaky' | 'fragile' =
                pct < 50 ? 'solid' : pct < 70 ? 'developing' : pct < 90 ? 'shaky' : 'fragile'
              return <ProgressBar value={pct} size="sm" status={status} />
            })()}
          </div>
        </Card>
      )}

      {sessions.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <span className="text-4xl block mb-3">🎤</span>
            <p className="text-foreground font-medium">
              עדיין לא ביצעתם תרגול קולי
            </p>
            <p className="text-sm text-text-muted mt-1">
              היכנסו לשיר והתחילו הקלטה
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Song filter */}
          {uniqueSongs.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label className="text-sm text-text-muted">סינון לפי שיר:</label>
              <select
                value={filterSongId}
                onChange={(e) => setFilterSongId(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
              >
                <option value="all">כל השירים</option>
                {uniqueSongs.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>

              {trend && (
                <span className={`text-sm font-medium ${trend.up ? 'text-status-solid' : 'text-status-shaky'}`}>
                  {trend.up ? '↑' : '↓'} {trend.diff} ({trend.pct}%)
                </span>
              )}
            </div>
          )}

          {/* Score chart */}
          {chartData.length >= 2 && (
            <Card header={<h2 className="text-sm font-semibold text-foreground">מגמת ציונים</h2>}>
              <ScoreHistoryChart data={chartData} />
            </Card>
          )}

          {/* Session list */}
          <div className="space-y-3">
            {filtered.map((s) => (
              <Link key={s.id} href={`/vocal-practice/sessions/${s.id}`}>
                <Card hoverable className="mb-3">
                  <div className="flex items-center gap-4">
                    <ScoreDial score={s.overallScore} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">
                        {s.songTitle}
                      </p>
                      <p className="text-xs text-text-muted">
                        {VOICE_PART_HE[s.voicePart] ?? s.voicePart}
                        {' · '}
                        {new Date(s.createdAt).toLocaleDateString('he-IL', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-[13px] text-text-muted">
                          גובה {Math.round(s.pitchScore)}
                        </span>
                        <span className="text-[13px] text-text-muted">
                          תזמון {Math.round(s.timingScore)}
                        </span>
                        <span className="text-[13px] text-text-muted">
                          דינמיקה {Math.round(s.dynamicsScore)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
