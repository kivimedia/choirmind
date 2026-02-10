'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DueChunk {
  chunkId: string
  songId: string
  songTitle: string
  chunkLabel: string
  status: 'fragile' | 'shaky' | 'developing' | 'solid' | 'locked'
  fadeLevel: number
}

interface SongSummary {
  id: string
  title: string
  chunkCount: number
}

interface PracticeData {
  dueChunks: DueChunk[]
  songs: SongSummary[]
  stats: {
    streak: number
    xp: number
    dueCount: number
  }
}

// ---------------------------------------------------------------------------
// Status labels (Hebrew)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  fragile: 'שביר',
  shaky: 'רעוע',
  developing: 'מתפתח',
  solid: 'יציב',
  locked: 'נעול',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PracticePage() {
  const router = useRouter()
  const [data, setData] = useState<PracticeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPracticeData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/practice')
      if (!res.ok) throw new Error('Failed to fetch practice data')
      const json: PracticeData = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPracticeData()
  }, [fetchPracticeData])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-text-muted">טוען נתוני תרגול...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-danger mb-4">{error}</p>
        <Button variant="outline" onClick={fetchPracticeData}>
          נסה שנית
        </Button>
      </div>
    )
  }

  const { dueChunks = [], songs = [], stats } = data ?? {
    dueChunks: [],
    songs: [],
    stats: { streak: 0, xp: 0, dueCount: 0 },
  }

  return (
    <div dir="rtl" className="w-full text-start">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-foreground mb-6">תרגול</h1>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card className="text-center">
          <div className="text-2xl font-bold text-accent">{stats.streak}</div>
          <div className="text-xs text-text-muted">רצף ימים</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-secondary">{stats.xp}</div>
          <div className="text-xs text-text-muted">XP</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-primary">{stats.dueCount}</div>
          <div className="text-xs text-text-muted">קטעים לתרגול</div>
        </Card>
      </div>

      {/* Daily review queue */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">תרגול היום</h2>

        {dueChunks.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="אין קטעים לתרגול היום"
            description="כל הקטעים מעודכנים! חזרו מאוחר יותר או תרגלו חופשי."
          />
        ) : (
          <>
            <div className="space-y-3 mb-4">
              {dueChunks.map((chunk) => (
                <Card
                  key={chunk.chunkId}
                  hoverable
                  onClick={() => router.push(`/practice/${chunk.songId}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">
                        {chunk.songTitle}
                      </p>
                      <p className="text-sm text-text-muted">{chunk.chunkLabel}</p>
                    </div>
                    <Badge variant={chunk.status as 'fragile' | 'shaky' | 'developing' | 'solid' | 'locked'}>
                      {STATUS_LABELS[chunk.status] ?? chunk.status}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => router.push('/practice/guided')}
            >
              התחל תרגול מודרך
            </Button>
          </>
        )}
      </section>

      {/* Free practice */}
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-4">תרגול חופשי</h2>

        {songs.length === 0 ? (
          <EmptyState
            icon="🎵"
            title="אין שירים"
            description="הוסיפו שירים כדי להתחיל לתרגל."
          />
        ) : (
          <div className="space-y-3">
            {songs.map((song) => (
              <Card
                key={song.id}
                hoverable
                onClick={() => router.push(`/practice/${song.id}`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {song.title}
                    </p>
                    <p className="text-sm text-text-muted">
                      {song.chunkCount} קטעים
                    </p>
                  </div>
                  <span className="text-text-muted text-lg" aria-hidden="true">
                    ←
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
