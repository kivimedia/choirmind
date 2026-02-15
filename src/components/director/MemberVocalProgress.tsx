'use client'

import { useState, useEffect, Fragment } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import ProgressBar from '@/components/ui/ProgressBar'
import ScoreDial from '@/components/vocal/ScoreDial'

interface MemberProgress {
  memberId: string
  userId: string
  name: string | null
  voicePart: string | null
  sessionCount: number
  avgScore: number
  trend: number
  lastPractice: string | null
  songBests: Record<string, number>
}

interface MemberSession {
  id: string
  songId: string
  voicePart: string
  overallScore: number
  pitchScore: number
  timingScore: number
  dynamicsScore: number
  createdAt: string
  song?: { id: string; title: string }
}

interface MemberVocalProgressProps {
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

function scoreColor(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-warning'
  return 'text-danger'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-success/10'
  if (score >= 60) return 'bg-warning/10'
  return 'bg-danger/10'
}

function relativeTimeHebrew(dateStr: string | null): string {
  if (!dateStr) return 'לא תרגל/ה'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'היום'
  if (diffDays === 1) return 'אתמול'
  if (diffDays < 7) return `לפני ${diffDays} ימים`
  if (diffDays < 30) return `לפני ${Math.floor(diffDays / 7)} שבועות`
  return date.toLocaleDateString('he-IL')
}

export default function MemberVocalProgress({ choirId }: MemberVocalProgressProps) {
  const [progress, setProgress] = useState<MemberProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [songNames, setSongNames] = useState<Record<string, string>>({})
  const [memberSessions, setMemberSessions] = useState<Record<string, MemberSession[]>>({})
  const [loadingSessions, setLoadingSessions] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)

    Promise.allSettled([
      fetch(`/api/director/vocal-progress?choirId=${choirId}`),
      fetch(`/api/songs?choirId=${choirId}`),
    ]).then(async ([progRes, songsRes]) => {
      if (progRes.status === 'fulfilled' && progRes.value.ok) {
        const data = await progRes.value.json()
        setProgress(data.progress ?? [])
      }
      if (songsRes.status === 'fulfilled' && songsRes.value.ok) {
        const data = await songsRes.value.json()
        const names: Record<string, string> = {}
        for (const s of data.songs ?? []) {
          names[s.id] = s.title
        }
        setSongNames(names)
      }
    }).finally(() => setLoading(false))
  }, [choirId])

  if (loading) {
    return (
      <Card
        header={
          <h2 className="text-lg font-semibold text-foreground">התקדמות קולית</h2>
        }
      >
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-border/30" />
          ))}
        </div>
      </Card>
    )
  }

  if (progress.length === 0) {
    return (
      <Card
        header={
          <h2 className="text-lg font-semibold text-foreground">התקדמות קולית</h2>
        }
      >
        <p className="py-6 text-center text-sm text-text-muted">
          אין נתוני תרגול קולי עדיין
        </p>
      </Card>
    )
  }

  return (
    <Card
      header={
        <h2 className="text-lg font-semibold text-foreground">התקדמות קולית</h2>
      }
    >
      <div className="overflow-x-auto -mx-5">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-border text-sm text-text-muted">
              <th className="px-5 py-2 text-start font-medium">חבר/ה</th>
              <th className="px-3 py-2 text-start font-medium">קול</th>
              <th className="px-3 py-2 text-start font-medium">ציון ממוצע</th>
              <th className="px-3 py-2 text-start font-medium">מגמה</th>
              <th className="px-3 py-2 text-start font-medium">תרגול אחרון</th>
              <th className="px-5 py-2 text-start font-medium">סשנים</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {progress.map((m) => {
              const expanded = expandedId === m.memberId
              const hasSongBests = Object.keys(m.songBests).length > 0

              return (
                <Fragment key={m.memberId}>
                  <tr
                    className={`transition-colors ${
                      m.sessionCount > 0 ? 'cursor-pointer hover:bg-surface-hover/50' : ''
                    } ${expanded ? 'bg-surface-hover/30' : ''}`}
                    onClick={() => {
                      if (m.sessionCount > 0) {
                        const newId = expanded ? null : m.memberId
                        setExpandedId(newId)
                        // Fetch member sessions if expanding and not already loaded
                        if (newId && !memberSessions[m.userId]) {
                          setLoadingSessions(m.userId)
                          fetch(`/api/director/member-sessions?choirId=${choirId}&memberId=${m.userId}&limit=10`)
                            .then(res => res.ok ? res.json() : null)
                            .then(data => {
                              if (data?.sessions) {
                                setMemberSessions(prev => ({ ...prev, [m.userId]: data.sessions }))
                              }
                            })
                            .catch(() => {})
                            .finally(() => setLoadingSessions(null))
                        }
                      }
                    }}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {m.sessionCount > 0 && (
                          <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>
                            ◀
                          </span>
                        )}
                        <span className="text-sm font-medium text-foreground">
                          {m.name || 'לא ידוע'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-text-muted">
                      {m.voicePart ? voicePartHe[m.voicePart] ?? m.voicePart : '—'}
                    </td>
                    <td className="px-3 py-3">
                      {m.sessionCount > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold tabular-nums ${scoreColor(m.avgScore)}`}>
                            {m.avgScore}
                          </span>
                          <ProgressBar
                            value={m.avgScore}
                            size="sm"
                            className="w-16"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.trend !== 0 ? (
                        <Badge variant={m.trend > 0 ? 'default' : 'fragile'}>
                          {m.trend > 0 ? `+${m.trend}` : m.trend}
                        </Badge>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-text-muted">
                      {relativeTimeHebrew(m.lastPractice)}
                    </td>
                    <td className="px-5 py-3 text-sm tabular-nums text-foreground">
                      {m.sessionCount}
                    </td>
                  </tr>

                  {/* Expanded: member sessions */}
                  {expanded && (
                    <tr>
                      <td colSpan={6} className="bg-surface-hover/20 px-5 py-3">
                        {loadingSessions === m.userId ? (
                          <div className="flex justify-center py-4">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          </div>
                        ) : memberSessions[m.userId]?.length ? (
                          <div className="space-y-2">
                            {memberSessions[m.userId].map((ms) => (
                              <Link
                                key={ms.id}
                                href={`/vocal-practice/sessions/${ms.id}`}
                                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-hover/50 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ScoreDial score={ms.overallScore} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {ms.song?.title || songNames[ms.songId] || ms.songId.slice(0, 8)}
                                  </p>
                                  <p className="text-xs text-text-muted">
                                    {voicePartHe[ms.voicePart] ?? ms.voicePart}
                                    {' · '}
                                    {new Date(ms.createdAt).toLocaleDateString('he-IL', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                                <div className="flex gap-2 text-xs text-text-muted shrink-0">
                                  <span>גובה {Math.round(ms.pitchScore)}</span>
                                  <span>תזמון {Math.round(ms.timingScore)}</span>
                                  <span>דינמיקה {Math.round(ms.dynamicsScore)}</span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : hasSongBests ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {Object.entries(m.songBests).map(([songId, bestScore]) => (
                              <div
                                key={songId}
                                className={`flex items-center justify-between rounded-lg px-3 py-2 ${scoreBg(bestScore)}`}
                              >
                                <span className="text-sm text-foreground truncate">
                                  {songNames[songId] || songId.slice(0, 8)}
                                </span>
                                <span className={`text-sm font-bold tabular-nums ${scoreColor(bestScore)}`}>
                                  {bestScore}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-text-muted text-center py-2">אין סשנים זמינים</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
