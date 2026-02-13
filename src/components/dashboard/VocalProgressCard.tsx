'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import ScoreHistoryChart from './ScoreHistoryChart'

interface VocalSession {
  overallScore: number
  pitchScore: number
  timingScore: number
  dynamicsScore: number
  createdAt: string
  song: { title: string }
}

export default function VocalProgressCard() {
  const [sessions, setSessions] = useState<VocalSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vocal-analysis/sessions?limit=20')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.sessions) setSessions(data.sessions)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || sessions.length === 0) return null

  const totalSessions = sessions.length
  const avgScore = Math.round(sessions.reduce((s, x) => s + x.overallScore, 0) / totalSessions)
  const bestScore = Math.round(Math.max(...sessions.map((s) => s.overallScore)))

  // Trend: compare last 3 vs previous 3
  const recent = sessions.slice(0, 3)
  const older = sessions.slice(3, 6)
  const recentAvg = recent.reduce((s, x) => s + x.overallScore, 0) / recent.length
  const olderAvg = older.length > 0 ? older.reduce((s, x) => s + x.overallScore, 0) / older.length : recentAvg
  const trendUp = recentAvg > olderAvg
  const trendDiff = Math.abs(Math.round(recentAvg - olderAvg))

  const chartData = [...sessions].reverse().map((s) => ({
    date: s.createdAt,
    overallScore: s.overallScore,
    pitchScore: s.pitchScore,
    timingScore: s.timingScore,
    dynamicsScore: s.dynamicsScore,
  }))

  const mostPracticedSong = sessions[0]?.song?.title ?? ''

  return (
    <Card
      header={
        <h2 className="text-sm font-semibold text-foreground">התקדמות קולית</h2>
      }
    >
      <div className="space-y-3">
        {mostPracticedSong && (
          <p className="text-xs text-text-muted">{mostPracticedSong}</p>
        )}

        <div className="flex gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-foreground">{totalSessions}</p>
            <p className="text-[10px] text-text-muted">סשנים</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{avgScore}</p>
            <p className="text-[10px] text-text-muted">ממוצע</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{bestScore}</p>
            <p className="text-[10px] text-text-muted">שיא</p>
          </div>
          <div>
            <p className={`text-lg font-bold ${trendUp ? 'text-status-solid' : 'text-status-shaky'}`}>
              {trendUp ? '↑' : '↓'} {trendDiff}
            </p>
            <p className="text-[10px] text-text-muted">מגמה</p>
          </div>
        </div>

        {chartData.length >= 2 && <ScoreHistoryChart data={chartData} />}
      </div>
    </Card>
  )
}
