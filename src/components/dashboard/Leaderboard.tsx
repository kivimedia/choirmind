'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

interface LeaderboardEntry {
  rank: number
  userId: string
  name: string | null
  image: string | null
  voicePart: string | null
  xp: number
  currentStreak: number
}

interface LeaderboardProps {
  choirId: string
  maxRows?: number
}

const voicePartHe: Record<string, string> = {
  soprano: 'סופרן',
  mezzo: 'מצו',
  alto: 'אלט',
  tenor: 'טנור',
  baritone: 'בריטון',
  bass: 'בס',
}

export default function Leaderboard({ choirId, maxRows }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/choir/${choirId}/leaderboard?period=${period}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setEntries(data.leaderboard ?? [])
          setCurrentUserId(data.currentUserId ?? '')
        }
      })
      .finally(() => setLoading(false))
  }, [choirId, period])

  const display = maxRows ? entries.slice(0, maxRows) : entries
  const currentUserEntry = entries.find((e) => e.userId === currentUserId)
  const currentUserInDisplay = display.some((e) => e.userId === currentUserId)

  const rankEmoji = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `${rank}`
  }

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">טבלת דירוג</h2>
          <div className="flex gap-1">
            {(['week', 'month', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                  period === p
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:bg-surface-hover'
                }`}
              >
                {p === 'week' ? 'שבוע' : p === 'month' ? 'חודש' : 'הכל'}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 rounded bg-border/30" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted">אין נתונים עדיין</p>
      ) : (
        <div className="space-y-1.5">
          {display.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                entry.userId === currentUserId ? 'bg-primary/5 ring-1 ring-primary/20' : ''
              }`}
            >
              <span className="w-8 text-center text-sm font-bold">{rankEmoji(entry.rank)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {entry.name || 'חבר/ת מקהלה'}
                </p>
                {entry.voicePart && (
                  <span className="text-[10px] text-text-muted">
                    {voicePartHe[entry.voicePart] ?? entry.voicePart}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground tabular-nums">{entry.xp}</span>
                <span className="text-[10px] text-text-muted">XP</span>
                {entry.currentStreak > 0 && (
                  <Badge variant="default" className="!text-[10px]">
                    🔥 {entry.currentStreak}
                  </Badge>
                )}
              </div>
            </div>
          ))}

          {/* Show current user if not in display */}
          {maxRows && currentUserEntry && !currentUserInDisplay && (
            <>
              <div className="border-t border-border my-1" />
              <div className="flex items-center gap-3 rounded-lg bg-primary/5 ring-1 ring-primary/20 px-3 py-2">
                <span className="w-8 text-center text-sm font-bold">{currentUserEntry.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {currentUserEntry.name || 'את/ה'}
                  </p>
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums">{currentUserEntry.xp} XP</span>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
