'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import ScoreHistoryChart from '@/components/dashboard/ScoreHistoryChart'
import VocalRangeChart from '@/components/analytics/VocalRangeChart'
import ConsistencyTracker from '@/components/analytics/ConsistencyTracker'

interface PerSongStat {
  songId: string
  title: string
  sessionCount: number
  avgScore: number
  bestScore: number
  avgPitch: number
  avgTiming: number
  avgDynamics: number
  consistency: number
}

interface AnalyticsData {
  totalSessions: number
  scoreHistory: {
    date: string
    songId: string
    songTitle: string
    overallScore: number
    pitchScore: number
    timingScore: number
    dynamicsScore: number
  }[]
  perSongStats: PerSongStat[]
  consistency: number | null
  improvementRate: number | null
  pitchRange: { min: number; max: number } | null
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSong, setSelectedSong] = useState<string>('')

  useEffect(() => {
    const url = selectedSong
      ? `/api/vocal-analysis/analytics?songId=${selectedSong}`
      : '/api/vocal-analysis/analytics'

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d) })
      .finally(() => setLoading(false))
  }, [selectedSong])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-border/40" />
        <div className="h-64 rounded-xl bg-border/30" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-40 rounded-xl bg-border/30" />
          <div className="h-40 rounded-xl bg-border/30" />
        </div>
      </div>
    )
  }

  const chartData = data?.scoreHistory.map((s) => ({
    date: s.date,
    overallScore: Math.round(s.overallScore),
    pitchScore: Math.round(s.pitchScore),
    timingScore: Math.round(s.timingScore),
    dynamicsScore: Math.round(s.dynamicsScore),
  })) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">אנליטיקות קוליות</h1>
        {data && data.perSongStats.length > 1 && (
          <select
            value={selectedSong}
            onChange={(e) => setSelectedSong(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">כל השירים</option>
            {data.perSongStats.map((s) => (
              <option key={s.songId} value={s.songId}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {!data || data.totalSessions === 0 ? (
        <Card>
          <p className="py-8 text-center text-text-muted">
            אין נתוני תרגול קולי עדיין — התחילו לתרגל כדי לראות אנליטיקות
          </p>
        </Card>
      ) : (
        <>
          {/* Score history chart */}
          <Card
            header={
              <h2 className="text-sm font-semibold text-foreground">
                היסטוריית ציונים ({data.totalSessions} סשנים)
              </h2>
            }
          >
            <ScoreHistoryChart data={chartData} />
          </Card>

          {/* Consistency + Range */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ConsistencyTracker
              consistency={data.consistency}
              improvementRate={data.improvementRate}
              totalSessions={data.totalSessions}
            />
            <VocalRangeChart pitchRange={data.pitchRange} />
          </div>

          {/* Per-song stats */}
          {data.perSongStats.length > 0 && (
            <Card
              header={
                <h2 className="text-sm font-semibold text-foreground">סטטיסטיקות לפי שיר</h2>
              }
            >
              <div className="overflow-x-auto -mx-5">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border text-sm text-text-muted">
                      <th className="px-5 py-2 text-start font-medium">שיר</th>
                      <th className="px-3 py-2 text-start font-medium">סשנים</th>
                      <th className="px-3 py-2 text-start font-medium">ממוצע</th>
                      <th className="px-3 py-2 text-start font-medium">שיא</th>
                      <th className="px-5 py-2 text-start font-medium">עקביות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.perSongStats.map((s) => (
                      <tr key={s.songId} className="hover:bg-surface-hover/50">
                        <td className="px-5 py-3 text-sm font-medium text-foreground truncate">
                          {s.title}
                        </td>
                        <td className="px-3 py-3 text-sm tabular-nums text-text-muted">
                          {s.sessionCount}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-sm font-bold tabular-nums ${
                            s.avgScore >= 80 ? 'text-success' : s.avgScore >= 60 ? 'text-warning' : 'text-danger'
                          }`}>
                            {s.avgScore}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm font-bold tabular-nums text-foreground">
                          {s.bestScore}
                        </td>
                        <td className="px-5 py-3 text-sm tabular-nums text-text-muted">
                          {s.consistency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
