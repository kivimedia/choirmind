'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import ProgressBar from '@/components/ui/ProgressBar'

interface SongReadiness {
  songId: string
  title: string
  chunkReadiness: number
  vocalReadiness: number
  combined: number
  vocalCoverage: number
  voiceParts: Record<string, { avgScore: number; memberCount: number }>
  targetDate: string | null
  daysUntil: number | null
}

interface ReadinessData {
  overall: number
  totalMembers: number
  songsCount: number
  songs: SongReadiness[]
}

interface ChoirReadinessIndicatorProps {
  choirId: string
}

const voicePartHe: Record<string, string> = {
  soprano: 'סופרן',
  mezzo: 'מצו',
  alto: 'אלט',
  tenor: 'טנור',
  baritone: 'בריטון',
  bass: 'בס',
}

function gaugeColor(value: number): string {
  if (value >= 80) return 'text-success'
  if (value >= 60) return 'text-warning'
  return 'text-danger'
}

export default function ChoirReadinessIndicator({ choirId }: ChoirReadinessIndicatorProps) {
  const [data, setData] = useState<ReadinessData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/director/choir-readiness?choirId=${choirId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d) })
      .finally(() => setLoading(false))
  }, [choirId])

  if (loading) {
    return (
      <Card
        header={
          <h2 className="text-lg font-semibold text-foreground">מוכנות המקהלה</h2>
        }
      >
        <div className="animate-pulse space-y-4">
          <div className="mx-auto h-32 w-32 rounded-full bg-border/30" />
          <div className="h-6 w-40 mx-auto rounded bg-border/30" />
        </div>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card
        header={
          <h2 className="text-lg font-semibold text-foreground">מוכנות המקהלה</h2>
        }
      >
        <p className="py-4 text-center text-sm text-text-muted">אין נתונים זמינים</p>
      </Card>
    )
  }

  return (
    <Card
      header={
        <h2 className="text-lg font-semibold text-foreground">מוכנות המקהלה</h2>
      }
    >
      <div className="space-y-6">
        {/* Main gauge */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-36 w-36 items-center justify-center">
            <svg className="absolute inset-0" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-border/30"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${(data.overall / 100) * 327} 327`}
                strokeDashoffset="0"
                strokeLinecap="round"
                className={gaugeColor(data.overall)}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <span className={`text-3xl font-bold tabular-nums ${gaugeColor(data.overall)}`}>
              {data.overall}%
            </span>
          </div>
          <p className="text-sm text-text-muted">
            {data.overall >= 80
              ? 'המקהלה מוכנה להופעה!'
              : data.overall >= 50
                ? 'המקהלה בדרך הנכונה'
                : 'יש עוד עבודה לעשות'}
          </p>
          <p className="text-xs text-text-muted">
            {data.totalMembers} חברים · {data.songsCount} שירים
          </p>
        </div>

        {/* Per-song bars */}
        {data.songs.length > 0 && (
          <div className="space-y-4">
            {data.songs.map((song) => (
              <div key={song.songId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">
                    {song.title}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs tabular-nums text-text-muted" dir="ltr">
                      {song.combined}%
                    </span>
                    {song.daysUntil !== null && song.daysUntil > 0 && (
                      <span className={`text-xs ${song.daysUntil <= 7 ? 'text-danger font-medium' : 'text-text-muted'}`}>
                        {song.daysUntil}d
                      </span>
                    )}
                  </div>
                </div>

                {/* Stacked bars: chunk readiness + vocal readiness */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <div className="text-[10px] text-text-muted mb-0.5">שינון</div>
                    <ProgressBar value={song.chunkReadiness} size="sm" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] text-text-muted mb-0.5">
                      קול ({song.vocalCoverage}% כיסוי)
                    </div>
                    <ProgressBar value={song.vocalReadiness} size="sm" />
                  </div>
                </div>

                {/* Per-voice-part breakdown */}
                {Object.keys(song.voiceParts).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(song.voiceParts).map(([part, info]) => (
                      <span
                        key={part}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                          info.avgScore >= 80
                            ? 'bg-success/10 text-success'
                            : info.avgScore >= 60
                              ? 'bg-warning/10 text-warning'
                              : info.avgScore > 0
                                ? 'bg-danger/10 text-danger'
                                : 'bg-border/20 text-text-muted'
                        }`}
                      >
                        {voicePartHe[part] ?? part}
                        {info.avgScore > 0 && (
                          <span className="font-bold tabular-nums">{info.avgScore}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
