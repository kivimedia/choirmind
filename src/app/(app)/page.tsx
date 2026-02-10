'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ProgressBar from '@/components/ui/ProgressBar'

interface PracticeData {
  chunksToReview: number
  estimatedMinutes: number
}

interface DashboardStats {
  practiceStreak: number
  totalXP: number
  songsInProgress: number
}

interface RecentActivity {
  id: string
  type: string
  songTitle: string
  timestamp: string
}

export default function HomePage() {
  const { data: session } = useSession()
  const t = useTranslations('practice')
  const tDash = useTranslations('dashboard')
  const tGames = useTranslations('games')

  const [practiceData, setPracticeData] = useState<PracticeData | null>(null)
  const [stats, setStats] = useState<DashboardStats>({
    practiceStreak: 0,
    totalXP: 0,
    songsInProgress: 0,
  })
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch practice queue data
        const practiceRes = await fetch('/api/practice')
        if (practiceRes.ok) {
          const data = await practiceRes.json()
          setPracticeData({
            chunksToReview: data.chunksToReview ?? data.queue?.length ?? 0,
            estimatedMinutes: data.estimatedMinutes ?? Math.ceil((data.queue?.length ?? 0) * 1.5),
          })
        }

        // Fetch dashboard stats
        const statsRes = await fetch('/api/dashboard/stats')
        if (statsRes.ok) {
          const data = await statsRes.json()
          setStats({
            practiceStreak: data.practiceStreak ?? 0,
            totalXP: data.totalXP ?? 0,
            songsInProgress: data.songsInProgress ?? 0,
          })
        }

        // Fetch recent activity
        const activityRes = await fetch('/api/dashboard/activity')
        if (activityRes.ok) {
          const data = await activityRes.json()
          setRecentActivity(data.activities ?? [])
        }
      } catch {
        // Silently handle — APIs may not exist yet
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const userName = session?.user?.name || ''

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {userName ? `${userName} ,` : ''} &#128075;
        </h1>
        <p className="mt-1 text-text-muted">
          {tDash('title')}
        </p>
      </div>

      {/* Today's practice card */}
      <Card className="border-primary/30 bg-gradient-to-bl from-primary/5 to-transparent">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('todayTitle')}
            </h2>
            {loading ? (
              <p className="mt-1 text-text-muted">{'\u2026'}</p>
            ) : practiceData && practiceData.chunksToReview > 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-2xl font-bold text-primary">
                  {practiceData.chunksToReview}{' '}
                  <span className="text-base font-normal text-text-muted">
                    {t('chunksToReview')}
                  </span>
                </p>
                <p className="text-sm text-text-muted">
                  {t('estimatedTime')}: ~{practiceData.estimatedMinutes}{' '}
                  {t('minutes')}
                </p>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-foreground">{t('noReviewsDue')}</p>
                <p className="text-sm text-text-muted">
                  {t('comeBackTomorrow')}
                </p>
              </div>
            )}
          </div>
          {practiceData && practiceData.chunksToReview > 0 && (
            <Link href="/practice">
              <Button variant="primary" size="lg">
                {t('start')}
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Practice streak */}
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20 text-lg">
              &#128293;
            </span>
            <div>
              <p className="text-sm text-text-muted">{tGames('streak')}</p>
              <p className="text-xl font-bold text-foreground">
                {loading ? '\u2014' : stats.practiceStreak}{' '}
                <span className="text-sm font-normal text-text-muted">
                  {tGames('days')}
                </span>
              </p>
            </div>
          </div>
        </Card>

        {/* Total XP */}
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/20 text-lg">
              &#11088;
            </span>
            <div>
              <p className="text-sm text-text-muted">{tGames('xp')}</p>
              <p className="text-xl font-bold text-foreground">
                {loading ? '\u2014' : stats.totalXP.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        {/* Songs in progress */}
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-lg">
              &#127925;
            </span>
            <div>
              <p className="text-sm text-text-muted">
                {tDash('songsProgress')}
              </p>
              <p className="text-xl font-bold text-foreground">
                {loading ? '\u2014' : stats.songsInProgress}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card header={<h2 className="text-lg font-semibold text-foreground">&#128196; פעילות אחרונה</h2>}>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : recentActivity.length > 0 ? (
          <ul className="divide-y divide-border">
            {recentActivity.map((activity) => (
              <li key={activity.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {activity.songTitle}
                  </p>
                  <p className="text-xs text-text-muted">{activity.type}</p>
                </div>
                <time className="text-xs text-text-muted">
                  {new Date(activity.timestamp).toLocaleDateString('he-IL')}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-8 text-center">
            <p className="text-text-muted">
              התחילו לתרגל כדי לראות פעילות כאן
            </p>
            <Link href="/songs" className="mt-3 inline-block">
              <Button variant="outline" size="sm">
                &#127925; עיינו בשירים
              </Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  )
}
