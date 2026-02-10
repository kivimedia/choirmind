'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import SongReadinessCard from '@/components/dashboard/SongReadinessCard'
import StatsCard from '@/components/dashboard/StatsCard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkData {
  id: string
  label: string
  status: string
  chunkType?: string
  order?: number
}

interface SongData {
  id: string
  title: string
  composer?: string | null
  chunks: ChunkData[]
}

interface PracticeQueueData {
  count: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_VALUE: Record<string, number> = {
  fragile: 0,
  shaky: 1,
  developing: 2,
  solid: 3,
  locked_in: 4,
  locked: 4,
}

function averageStatusPercent(chunks: ChunkData[]): number {
  if (chunks.length === 0) return 0
  const total = chunks.reduce((sum, c) => sum + (STATUS_VALUE[c.status] ?? 0), 0)
  // Max possible = 4 per chunk
  return Math.round((total / (chunks.length * 4)) * 100)
}

function solidPlusPercent(chunks: ChunkData[]): number {
  if (chunks.length === 0) return 0
  const solidCount = chunks.filter(
    (c) => c.status === 'solid' || c.status === 'locked_in' || c.status === 'locked'
  ).length
  return Math.round((solidCount / chunks.length) * 100)
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-border/40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-border/30" />
        ))}
      </div>
      <div className="h-40 rounded-xl bg-border/30" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-36 rounded-xl bg-border/30" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Circular readiness display
// ---------------------------------------------------------------------------

function ReadinessCircle({ percent }: { percent: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  // RTL: progress fills clockwise from the right (use stroke-dashoffset)
  const dashOffset = circumference - (circumference * percent) / 100

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-36 w-36">
        <svg
          className="h-full w-full -rotate-90"
          viewBox="0 0 120 120"
          aria-hidden="true"
        >
          {/* Background circle */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-border/40"
            strokeWidth="10"
          />
          {/* Progress circle */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-primary transition-all duration-700 ease-out"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        {/* Percentage text in the center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-foreground tabular-nums" dir="ltr">
            {percent}%
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: session } = useSession()
  const [songs, setSongs] = useState<SongData[]>([])
  const [practiceQueue, setPracticeQueue] = useState<PracticeQueueData | null>(null)
  const [loading, setLoading] = useState(true)

  // Mock stats that would normally come from an API
  const [stats] = useState({
    practiceStreak: 5,
    totalXP: 1240,
  })

  // ---- Fetch data ----
  useEffect(() => {
    async function fetchAll() {
      try {
        const [songsRes, practiceRes] = await Promise.allSettled([
          fetch('/api/songs'),
          fetch('/api/practice'),
        ])

        if (songsRes.status === 'fulfilled' && songsRes.value.ok) {
          const data = await songsRes.value.json()
          const rawSongs = data.songs ?? []
          // Map chunks: use userChunkProgress status if available, else default to 'fragile'
          const mapped: SongData[] = rawSongs.map(
            (s: Record<string, unknown> & { chunks?: Record<string, unknown>[] }) => ({
              id: s.id as string,
              title: s.title as string,
              composer: (s.composer as string) || null,
              chunks: (s.chunks ?? []).map(
                (c: Record<string, unknown>) => ({
                  id: c.id as string,
                  label: (c.label as string) || `\u05E7\u05D8\u05E2 ${c.order}`,
                  status: (c.status as string) || 'fragile',
                  chunkType: c.chunkType as string | undefined,
                  order: c.order as number | undefined,
                })
              ),
            })
          )
          setSongs(mapped)
        }

        if (practiceRes.status === 'fulfilled' && practiceRes.value.ok) {
          const data = await practiceRes.value.json()
          setPracticeQueue({
            count: data.count ?? data.reviewQueue?.length ?? 0,
          })
        } else {
          setPracticeQueue({ count: 0 })
        }
      } catch {
        // Graceful fallback — show empty state
        setPracticeQueue({ count: 0 })
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [])

  // ---- Derived data ----
  const allChunks = useMemo(() => songs.flatMap((s) => s.chunks), [songs])

  const overallReadiness = useMemo(
    () => averageStatusPercent(allChunks),
    [allChunks]
  )

  const totalSolidChunks = useMemo(
    () =>
      allChunks.filter(
        (c) => c.status === 'solid' || c.status === 'locked_in' || c.status === 'locked'
      ).length,
    [allChunks]
  )

  // ---- Render ----
  if (loading) return <LoadingSkeleton />

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {'\u05DC\u05D5\u05D7 \u05DE\u05D5\u05DB\u05E0\u05D5\u05EA'}
        </h1>
        {session?.user?.name && (
          <p className="mt-1 text-text-muted">
            {'\u05E9\u05DC\u05D5\u05DD'}, {session.user.name}
          </p>
        )}
      </div>

      {/* ==================== Overall Readiness ==================== */}
      <section aria-labelledby="readiness-heading">
        <Card
          header={
            <h2 id="readiness-heading" className="text-lg font-semibold text-foreground">
              {'\u05DE\u05D5\u05DB\u05E0\u05D5\u05EA \u05DB\u05DC\u05DC\u05D9\u05EA'}
            </h2>
          }
        >
          {songs.length === 0 ? (
            <p className="py-4 text-center text-text-muted">
              {'\u05D0\u05D9\u05DF \u05E9\u05D9\u05E8\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF \u2014 \u05D4\u05D5\u05E1\u05D9\u05E4\u05D5 \u05E9\u05D9\u05E8 \u05DB\u05D3\u05D9 \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC'}
            </p>
          ) : (
            <ReadinessCircle percent={overallReadiness} />
          )}
        </Card>
      </section>

      {/* ==================== Daily Queue ==================== */}
      <section aria-labelledby="daily-queue-heading">
        <Card
          header={
            <h2 id="daily-queue-heading" className="text-lg font-semibold text-foreground">
              {'\u05EA\u05D5\u05E8 \u05D9\u05D5\u05DE\u05D9'}
            </h2>
          }
          className="border-primary/20 bg-gradient-to-bl from-primary/5 to-transparent"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {practiceQueue && practiceQueue.count > 0 ? (
                <>
                  <p className="text-2xl font-bold text-primary tabular-nums">
                    {practiceQueue.count}{' '}
                    <span className="text-base font-normal text-text-muted">
                      {'\u05E7\u05D8\u05E2\u05D9\u05DD \u05DC\u05D7\u05D6\u05E8\u05D4'}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    ~{Math.ceil(practiceQueue.count * 1.5)}{' '}
                    {'\u05D3\u05E7\u05D5\u05EA'}
                  </p>
                </>
              ) : (
                <p className="text-foreground">
                  {'\u05D0\u05D9\u05DF \u05E7\u05D8\u05E2\u05D9\u05DD \u05DC\u05D7\u05D6\u05E8\u05D4 \u05D4\u05D9\u05D5\u05DD \u2014 \u05DB\u05DC \u05D4\u05DB\u05D1\u05D5\u05D3!'}
                </p>
              )}
            </div>
            {practiceQueue && practiceQueue.count > 0 && (
              <Link href="/practice">
                <Button variant="primary" size="lg">
                  {'\u05D4\u05EA\u05D7\u05DC \u05EA\u05E8\u05D2\u05D5\u05DC'}
                </Button>
              </Link>
            )}
          </div>
        </Card>
      </section>

      {/* ==================== Stats ==================== */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="mb-3 text-lg font-semibold text-foreground">
          {'\u05E1\u05D8\u05D8\u05D9\u05E1\u05D8\u05D9\u05E7\u05D5\u05EA'}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatsCard
            icon={'\uD83D\uDD25'}
            label={'\u05E8\u05E6\u05E3 \u05EA\u05E8\u05D2\u05D5\u05DC'}
            value={stats.practiceStreak}
            subtitle={'\u05D9\u05DE\u05D9\u05DD \u05E8\u05E6\u05D5\u05E4\u05D9\u05DD'}
          />
          <StatsCard
            icon={'\u2B50'}
            label={'XP'}
            value={stats.totalXP}
          />
          <StatsCard
            icon={'\uD83C\uDFB5'}
            label={'\u05E9\u05D9\u05E8\u05D9\u05DD'}
            value={songs.length}
          />
          <StatsCard
            icon={'\u2705'}
            label={'\u05E7\u05D8\u05E2\u05D9\u05DD \u05DE\u05D5\u05E9\u05DC\u05DE\u05D9\u05DD'}
            value={totalSolidChunks}
            subtitle={`\u05DE\u05EA\u05D5\u05DA ${allChunks.length}`}
          />
        </div>
      </section>

      {/* ==================== Songs Progress ==================== */}
      <section aria-labelledby="songs-progress-heading">
        <h2 id="songs-progress-heading" className="mb-3 text-lg font-semibold text-foreground">
          {'\u05D4\u05EA\u05E7\u05D3\u05DE\u05D5\u05EA \u05E9\u05D9\u05E8\u05D9\u05DD'}
        </h2>

        {songs.length === 0 ? (
          <EmptyState
            icon={'\uD83C\uDFB6'}
            title={'\u05D0\u05D9\u05DF \u05E9\u05D9\u05E8\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF'}
            description={'\u05D4\u05D5\u05E1\u05D9\u05E4\u05D5 \u05E9\u05D9\u05E8 \u05D7\u05D3\u05E9 \u05D0\u05D5 \u05D4\u05E6\u05D8\u05E8\u05E4\u05D5 \u05DC\u05DE\u05E7\u05D4\u05DC\u05D4'}
            actionLabel={'\u05D4\u05D5\u05E1\u05E4\u05EA \u05E9\u05D9\u05E8'}
            onAction={() => {
              window.location.href = '/songs/new'
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {songs.map((song) => (
              <SongReadinessCard key={song.id} song={song} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
