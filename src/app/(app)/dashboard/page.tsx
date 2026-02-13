'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Card from '@/components/ui/Card'
import StatsCard from '@/components/dashboard/StatsCard'
import SongReadinessCard from '@/components/dashboard/SongReadinessCard'
import HeroCTA from '@/components/dashboard/HeroCTA'
import WeekActivity from '@/components/dashboard/WeekActivity'
import WeakestChunks from '@/components/dashboard/WeakestChunks'
import ConcertCountdown from '@/components/dashboard/ConcertCountdown'
import AchievementProgress from '@/components/dashboard/AchievementProgress'
import { VocalQuotaCard, LastVocalScore } from '@/components/dashboard/VocalQuotaCard'
import VocalProgressCard from '@/components/dashboard/VocalProgressCard'
import Leaderboard from '@/components/dashboard/Leaderboard'
import { useChoirStore } from '@/stores/useChoirStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  user: {
    xp: number
    currentStreak: number
    longestStreak: number
    lastPracticeDate: string | null
  }
  dueChunksCount: number
  estimatedMinutes: number
  songsCount: number
  chunksTotal: number
  chunksMastered: number
  weakestChunks: {
    chunkId: string
    songTitle: string
    chunkLabel: string
    memoryStrength: number
    status: string
  }[]
  recentAchievements: { achievement: string; unlockedAt: string }[]
  nextMilestone: { achievement: string; progress: number; target: number } | null
  concertCountdowns: {
    songId: string
    title: string
    targetDate: string
    readinessPercent: number
  }[]
  newAssignments: { songTitle: string; assignedBy: string; assignedAt: string }[]
  weekActivity: { date: string; practiced: boolean }[]
  vocalQuota: { secondsUsed: number; secondsLimit: number } | null
  lastVocalScore: {
    songTitle: string
    voicePart: string
    score: number
    previousScore: number | null
    date: string
  } | null
  userState: 'no_choir' | 'no_assignments' | 'never_practiced' | 'has_due' | 'caught_up'
}

interface SongData {
  id: string
  title: string
  composer?: string | null
  chunks: { id: string; label: string; status: string }[]
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-border/40" />
      <div className="h-24 rounded-xl bg-border/30" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-border/30" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-36 rounded-xl bg-border/30" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: session } = useSession()
  const { activeChoirId } = useChoirStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [songs, setSongs] = useState<SongData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, songsRes] = await Promise.allSettled([
          fetch('/api/dashboard/stats'),
          fetch('/api/songs'),
        ])

        if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
          const data = await statsRes.value.json()
          setStats(data)
        }

        if (songsRes.status === 'fulfilled' && songsRes.value.ok) {
          const data = await songsRes.value.json()
          const rawSongs = data.songs ?? []
          const mapped: SongData[] = rawSongs.map(
            (s: Record<string, unknown> & { chunks?: Record<string, unknown>[] }) => ({
              id: s.id as string,
              title: s.title as string,
              composer: (s.composer as string) || null,
              chunks: (s.chunks ?? []).map((c: Record<string, unknown>) => ({
                id: c.id as string,
                label: (c.label as string) || `קטע ${c.order}`,
                status: (c.status as string) || 'fragile',
              })),
            })
          )
          setSongs(mapped)
        }
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [])

  if (loading) return <LoadingSkeleton />

  // Streak-at-risk check
  const streakAtRisk =
    stats?.user.currentStreak &&
    stats.user.currentStreak > 0 &&
    stats.user.lastPracticeDate &&
    new Date(stats.user.lastPracticeDate).toDateString() !== new Date().toDateString()

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {'לוח מוכנות'}
        </h1>
        {session?.user?.name && (
          <p className="mt-1 text-text-muted">
            {'שלום'}, {session.user.name}
          </p>
        )}
      </div>

      {/* ==================== Hero CTA ==================== */}
      {stats && (
        <section aria-label="primary-action">
          <HeroCTA
            userState={stats.userState}
            dueChunksCount={stats.dueChunksCount}
            estimatedMinutes={stats.estimatedMinutes}
            songsCount={stats.songsCount}
          />
        </section>
      )}

      {/* ==================== New Assignments Alert ==================== */}
      {stats && stats.newAssignments.length > 0 && (
        <section aria-label="new-assignments">
          <Card className="border-secondary/20 bg-gradient-to-bl from-secondary/5 to-transparent">
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">
                {'שיעורים חדשים'}
              </p>
              <ul className="space-y-1">
                {stats.newAssignments.map((a, i) => (
                  <li key={i} className="text-sm text-text-muted">
                    <span className="font-medium text-foreground">{a.songTitle}</span>
                    {' — '}{a.assignedBy}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>
      )}

      {/* ==================== Stats Row ==================== */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="mb-3 text-lg font-semibold text-foreground">
          {'סטטיסטיקות'}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatsCard
            icon={'🔥'}
            label={'רצף תרגול'}
            value={stats?.user.currentStreak ?? 0}
            subtitle={
              streakAtRisk
                ? '⚠️ תרגלו היום לשמור על הרצף!'
                : 'ימים רצופים'
            }
          />
          <StatsCard
            icon={'⭐'}
            label={'XP'}
            value={stats?.user.xp ?? 0}
          />
          <StatsCard
            icon={'🎵'}
            label={'שירים'}
            value={stats?.songsCount ?? songs.length}
          />
          <StatsCard
            icon={'✅'}
            label={'קטעים מושלמים'}
            value={stats?.chunksMastered ?? 0}
            subtitle={stats ? `מתוך ${stats.chunksTotal}` : undefined}
          />
        </div>
      </section>

      {/* ==================== Weekly Activity + Achievements ==================== */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Weekly Activity */}
        {stats && stats.weekActivity.length > 0 && (
          <Card
            header={
              <h2 className="text-sm font-semibold text-foreground">
                {'פעילות השבוע'}
              </h2>
            }
          >
            <WeekActivity days={stats.weekActivity} />
          </Card>
        )}

        {/* Achievements */}
        {stats && (
          <Card
            header={
              <h2 className="text-sm font-semibold text-foreground">
                {'הישגים'}
              </h2>
            }
          >
            <AchievementProgress
              recentAchievements={stats.recentAchievements}
              nextMilestone={stats.nextMilestone}
            />
          </Card>
        )}
      </section>

      {/* ==================== Vocal Practice Section ==================== */}
      {stats && (stats.vocalQuota || stats.lastVocalScore) && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {stats.vocalQuota && (
            <VocalQuotaCard
              secondsUsed={stats.vocalQuota.secondsUsed}
              secondsLimit={stats.vocalQuota.secondsLimit}
            />
          )}
          {stats.lastVocalScore && (
            <LastVocalScore
              songTitle={stats.lastVocalScore.songTitle}
              voicePart={stats.lastVocalScore.voicePart}
              score={stats.lastVocalScore.score}
              previousScore={stats.lastVocalScore.previousScore}
            />
          )}
        </section>
      )}

      {/* ==================== Vocal Progress + Leaderboard ==================== */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <VocalProgressCard />
        {activeChoirId && <Leaderboard choirId={activeChoirId} maxRows={5} />}
      </section>

      {/* ==================== Concert Countdowns + Weakest Chunks ==================== */}
      {stats && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {stats.concertCountdowns.length > 0 && (
            <ConcertCountdown concerts={stats.concertCountdowns} />
          )}
          {stats.weakestChunks.length > 0 && (
            <WeakestChunks chunks={stats.weakestChunks} />
          )}
        </section>
      )}

      {/* ==================== Songs Progress ==================== */}
      {songs.length > 0 && (
        <section aria-labelledby="songs-progress-heading">
          <h2 id="songs-progress-heading" className="mb-3 text-lg font-semibold text-foreground">
            {'התקדמות שירים'}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {songs.map((song) => (
              <SongReadinessCard key={song.id} song={song} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
