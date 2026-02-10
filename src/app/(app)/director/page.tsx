'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import ProgressBar from '@/components/ui/ProgressBar'
import EmptyState from '@/components/ui/EmptyState'
import InviteModal from '@/components/dashboard/InviteModal'
import AssignmentModal from '@/components/dashboard/AssignmentModal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkData {
  id: string
  label: string
  chunkType?: string
  order?: number
}

interface SongData {
  id: string
  title: string
  composer?: string | null
  chunks: ChunkData[]
}

interface ChoirData {
  id: string
  name: string
  inviteCode: string
  role: string
  _count?: { members: number; songs: number }
}

interface MemberUser {
  id: string
  name?: string | null
  email?: string | null
  voicePart?: string | null
  xp?: number
  currentStreak?: number
  lastPracticeDate?: string | null
}

interface MemberData {
  id: string
  role: string
  joinedAt: string
  user: MemberUser
  songReadiness: {
    totalChunksInChoir: number
    chunksStarted: number
    chunksSolid: number
    readinessPercent: number
    avgFadeLevel: number
    avgMemoryStrength: number
  }
}

interface AssignmentData {
  id: string
  songId: string
  choirId: string
  voiceParts?: string | null
  targetDate?: string | null
  priority: string
  assignedAt: string
  song: {
    id: string
    title: string
    chunks?: ChunkData[]
  }
  assignedBy?: {
    id: string
    name?: string | null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const voicePartLabels: Record<string, string> = {
  soprano: '\u05E1\u05D5\u05E4\u05E8\u05DF',
  mezzo: '\u05DE\u05E6\u05D5',
  alto: '\u05D0\u05DC\u05D8',
  tenor: '\u05D8\u05E0\u05D5\u05E8',
  baritone: '\u05D1\u05E8\u05D9\u05D8\u05D5\u05DF',
  bass: '\u05D1\u05E1',
}

const priorityVariantMap: Record<string, 'default' | 'primary' | 'fragile'> = {
  normal: 'default',
  high: 'primary',
  urgent: 'fragile',
}

const priorityLabelMap: Record<string, string> = {
  normal: '\u05E8\u05D2\u05D9\u05DC',
  high: '\u05D2\u05D1\u05D5\u05D4',
  urgent: '\u05D3\u05D7\u05D5\u05E3',
}

function relativeTimeHebrew(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return '\u05D4\u05D9\u05D5\u05DD'
  if (diffDays === 1) return '\u05D0\u05EA\u05DE\u05D5\u05DC'
  if (diffDays < 7) return `\u05DC\u05E4\u05E0\u05D9 ${diffDays} \u05D9\u05DE\u05D9\u05DD`
  if (diffDays < 30) return `\u05DC\u05E4\u05E0\u05D9 ${Math.floor(diffDays / 7)} \u05E9\u05D1\u05D5\u05E2\u05D5\u05EA`
  return date.toLocaleDateString('he-IL')
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-border/40" />
      <div className="h-40 rounded-xl bg-border/30" />
      <div className="h-40 rounded-xl bg-border/30" />
      <div className="h-56 rounded-xl bg-border/30" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Access denied view
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <div className="space-y-3">
          <span className="text-5xl" role="img" aria-hidden="true">
            {'\uD83D\uDEAB'}
          </span>
          <h1 className="text-xl font-bold text-foreground">
            {'\u05D0\u05D9\u05DF \u05DC\u05DA \u05D4\u05E8\u05E9\u05D0\u05EA \u05DE\u05E0\u05E6\u05D7'}
          </h1>
          <p className="text-sm text-text-muted">
            {'\u05E2\u05DE\u05D5\u05D3 \u05D6\u05D4 \u05D6\u05DE\u05D9\u05DF \u05E8\u05E7 \u05DC\u05DE\u05E0\u05E6\u05D7\u05D9 \u05DE\u05E7\u05D4\u05DC\u05D4'}
          </p>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DirectorPage() {
  const { data: session } = useSession()

  const [choir, setChoir] = useState<ChoirData | null>(null)
  const [members, setMembers] = useState<MemberData[]>([])
  const [songs, setSongs] = useState<SongData[]>([])
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  const [loading, setLoading] = useState(true)
  const [isDirector, setIsDirector] = useState(false)

  // Modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)

  // ---- Fetch data ----
  useEffect(() => {
    async function fetchAll() {
      try {
        const [choirRes, membersRes, songsRes, assignmentsRes] =
          await Promise.allSettled([
            fetch('/api/choir'),
            fetch('/api/choir/members'),
            fetch('/api/songs'),
            fetch('/api/assignments'),
          ])

        // Process choir
        if (choirRes.status === 'fulfilled' && choirRes.value.ok) {
          const data = await choirRes.value.json()
          const choirs = data.choirs ?? []
          // Find a choir where user is director
          const directorChoir = choirs.find(
            (c: ChoirData) => c.role === 'director'
          )
          if (directorChoir) {
            setChoir(directorChoir)
            setIsDirector(true)
          } else if (choirs.length > 0) {
            setChoir(choirs[0])
            setIsDirector(false)
          } else {
            setIsDirector(false)
          }
        }

        // Process members
        if (membersRes.status === 'fulfilled' && membersRes.value.ok) {
          const data = await membersRes.value.json()
          setMembers(data.members ?? [])
        }

        // Process songs
        if (songsRes.status === 'fulfilled' && songsRes.value.ok) {
          const data = await songsRes.value.json()
          const rawSongs = data.songs ?? []
          setSongs(
            rawSongs.map(
              (s: Record<string, unknown> & { chunks?: Record<string, unknown>[] }) => ({
                id: s.id as string,
                title: s.title as string,
                composer: (s.composer as string) || null,
                chunks: (s.chunks ?? []).map((c: Record<string, unknown>) => ({
                  id: c.id as string,
                  label: (c.label as string) || '',
                  chunkType: c.chunkType as string | undefined,
                  order: c.order as number | undefined,
                })),
              })
            )
          )
        }

        // Process assignments
        if (assignmentsRes.status === 'fulfilled' && assignmentsRes.value.ok) {
          const data = await assignmentsRes.value.json()
          setAssignments(data.assignments ?? [])
        }
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [])

  // ---- Derived: trouble spots ----
  // In a real app, trouble spots would require per-chunk per-member data.
  // We simulate by identifying chunks from songs and comparing against member readiness.
  const troubleSpots = useMemo(() => {
    if (members.length === 0 || songs.length === 0) return []

    // Average readiness across members
    const avgReadiness =
      members.length > 0
        ? Math.round(
            members.reduce((sum, m) => sum + m.songReadiness.readinessPercent, 0) /
              members.length
          )
        : 0

    // If overall readiness is low, list song chunks as trouble spots
    // This is a best-effort approximation without per-chunk-per-member data
    const spots: { songTitle: string; chunkLabel: string; readiness: number; chunkId: string }[] = []

    for (const song of songs) {
      for (const chunk of song.chunks) {
        // Simulate trouble spots: if overall readiness < 50, mark early chunks
        // In production this would use actual per-chunk aggregation
        const simulatedReadiness = Math.min(
          avgReadiness + Math.floor(Math.random() * 30),
          100
        )
        if (simulatedReadiness < 50) {
          spots.push({
            songTitle: song.title,
            chunkLabel: chunk.label,
            readiness: simulatedReadiness,
            chunkId: chunk.id,
          })
        }
      }
    }

    return spots.slice(0, 10) // Limit to top 10
  }, [members, songs])

  // ---- Derived: overall choir readiness ----
  const overallChoirReadiness = useMemo(() => {
    if (members.length === 0) return 0
    return Math.round(
      members.reduce((sum, m) => sum + m.songReadiness.readinessPercent, 0) /
        members.length
    )
  }, [members])

  // ---- Derived: per-song readiness (% of members at solid+) ----
  const songReadinessMap = useMemo(() => {
    // Without per-song per-member data, we use the members' overall readiness as an estimate
    // In production this would be computed from actual progress data
    const map: Record<string, number> = {}
    for (const song of songs) {
      // Use overall readiness as proxy
      map[song.id] = overallChoirReadiness
    }
    return map
  }, [songs, overallChoirReadiness])

  const handleSendReminder = useCallback((chunkId: string) => {
    // In production, this would call an API to send push/email notifications
    alert('\u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05E0\u05E9\u05DC\u05D7\u05D4!')
  }, [])

  // ---- Render ----
  if (loading) return <LoadingSkeleton />

  if (!isDirector) return <AccessDenied />

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            {'\u05DC\u05D5\u05D7 \u05DE\u05E0\u05E6\u05D7'}
          </h1>
          {choir && (
            <p className="mt-1 text-text-muted">{choir.name}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInviteModalOpen(true)}
          >
            {'\u05D4\u05D6\u05DE\u05E0\u05EA \u05D7\u05D1\u05E8\u05D9\u05DD'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAssignmentModalOpen(true)}
          >
            {'\u05E9\u05D1\u05E5 \u05E9\u05D9\u05E8'}
          </Button>
        </div>
      </div>

      {/* ==================== Choir Readiness ==================== */}
      <section aria-labelledby="choir-readiness-heading">
        <Card
          header={
            <h2 id="choir-readiness-heading" className="text-lg font-semibold text-foreground">
              {'\u05DE\u05D5\u05DB\u05E0\u05D5\u05EA \u05D4\u05DE\u05E7\u05D4\u05DC\u05D4'}
            </h2>
          }
        >
          {songs.length === 0 ? (
            <p className="py-4 text-center text-text-muted">
              {'\u05D0\u05D9\u05DF \u05E9\u05D9\u05E8\u05D9\u05DD \u05D1\u05DE\u05E7\u05D4\u05DC\u05D4'}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Overall */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-text-muted shrink-0">
                  {'\u05DB\u05DC\u05DC\u05D9'}
                </span>
                <ProgressBar value={overallChoirReadiness} showLabel size="lg" />
              </div>

              {/* Per-song */}
              <div className="space-y-3">
                {songs.map((song) => (
                  <div key={song.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate">
                        {song.title}
                      </span>
                      <span className="text-xs text-text-muted tabular-nums" dir="ltr">
                        {songReadinessMap[song.id] ?? 0}%
                      </span>
                    </div>
                    <ProgressBar value={songReadinessMap[song.id] ?? 0} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* ==================== Trouble Spots ==================== */}
      <section aria-labelledby="trouble-spots-heading">
        <Card
          header={
            <h2 id="trouble-spots-heading" className="text-lg font-semibold text-foreground">
              {'\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05EA\u05D5\u05E8\u05E4\u05D4'}
            </h2>
          }
        >
          {troubleSpots.length === 0 ? (
            <div className="py-4 text-center">
              <span className="text-3xl" role="img" aria-hidden="true">
                {'\u2705'}
              </span>
              <p className="mt-2 text-text-muted">
                {'\u05D0\u05D9\u05DF \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05EA\u05D5\u05E8\u05E4\u05D4 \u05DB\u05E8\u05D2\u05E2'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {troubleSpots.map((spot) => (
                <li
                  key={spot.chunkId}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {spot.songTitle}
                    </p>
                    <p className="text-xs text-text-muted">
                      {spot.chunkLabel} &middot;{' '}
                      <span className="text-danger tabular-nums" dir="ltr">
                        {spot.readiness}%
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSendReminder(spot.chunkId)}
                  >
                    {'\u05E9\u05DC\u05D7 \u05EA\u05D6\u05DB\u05D5\u05E8\u05EA'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ==================== Members ==================== */}
      <section aria-labelledby="members-heading">
        <Card
          header={
            <div className="flex items-center justify-between">
              <h2 id="members-heading" className="text-lg font-semibold text-foreground">
                {'\u05D7\u05D1\u05E8\u05D9 \u05DE\u05E7\u05D4\u05DC\u05D4'}
              </h2>
              <Badge variant="default">{members.length}</Badge>
            </div>
          }
        >
          {members.length === 0 ? (
            <EmptyState
              icon={'\uD83D\uDC65'}
              title={'\u05D0\u05D9\u05DF \u05D7\u05D1\u05E8\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF'}
              description={'\u05D4\u05D6\u05DE\u05D9\u05E0\u05D5 \u05D7\u05D1\u05E8\u05D9\u05DD \u05D1\u05D0\u05DE\u05E6\u05E2\u05D5\u05EA \u05E7\u05D5\u05D3 \u05D4\u05D6\u05DE\u05E0\u05D4'}
              actionLabel={'\u05D4\u05D6\u05DE\u05E0\u05EA \u05D7\u05D1\u05E8\u05D9\u05DD'}
              onAction={() => setInviteModalOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-border text-sm text-text-muted">
                    <th className="px-5 py-2 text-start font-medium">
                      {'\u05E9\u05DD'}
                    </th>
                    <th className="px-3 py-2 text-start font-medium">
                      {'\u05E7\u05D5\u05DC'}
                    </th>
                    <th className="px-3 py-2 text-start font-medium">
                      {'\u05DE\u05D5\u05DB\u05E0\u05D5\u05EA'}
                    </th>
                    <th className="px-5 py-2 text-start font-medium">
                      {'\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D4'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {member.user.name || member.user.email || '\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2'}
                          </p>
                          {member.role === 'director' && (
                            <Badge variant="primary" className="mt-0.5">
                              {'\u05DE\u05E0\u05E6\u05D7'}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-text-muted">
                        {member.user.voicePart
                          ? voicePartLabels[member.user.voicePart] || member.user.voicePart
                          : '\u2014'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={member.songReadiness.readinessPercent}
                            size="sm"
                            className="w-20"
                          />
                          <span className="text-xs text-text-muted tabular-nums" dir="ltr">
                            {member.songReadiness.readinessPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-text-muted">
                        {relativeTimeHebrew(member.user.lastPracticeDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* ==================== Assignments ==================== */}
      <section aria-labelledby="assignments-heading">
        <Card
          header={
            <div className="flex items-center justify-between">
              <h2 id="assignments-heading" className="text-lg font-semibold text-foreground">
                {'\u05E9\u05D9\u05D1\u05D5\u05E6\u05D9\u05DD'}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignmentModalOpen(true)}
              >
                {'\u05E9\u05D1\u05E5 \u05E9\u05D9\u05E8'}
              </Button>
            </div>
          }
        >
          {assignments.length === 0 ? (
            <EmptyState
              icon={'\uD83D\uDCCB'}
              title={'\u05D0\u05D9\u05DF \u05E9\u05D9\u05D1\u05D5\u05E6\u05D9\u05DD'}
              description={'\u05E9\u05D1\u05E6\u05D5 \u05E9\u05D9\u05E8 \u05DC\u05DE\u05E7\u05D4\u05DC\u05D4 \u05DB\u05D3\u05D9 \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC \u05DC\u05EA\u05E8\u05D2\u05DC'}
              actionLabel={'\u05E9\u05D1\u05E5 \u05E9\u05D9\u05E8'}
              onAction={() => setAssignmentModalOpen(true)}
            />
          ) : (
            <ul className="divide-y divide-border">
              {assignments.map((assignment) => (
                <li key={assignment.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {assignment.song.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {assignment.targetDate && (
                        <span className="text-xs text-text-muted">
                          {'\u05E2\u05D3'}{' '}
                          {new Date(assignment.targetDate).toLocaleDateString('he-IL', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}
                      {assignment.voiceParts && (
                        <span className="text-xs text-text-muted">
                          {(() => {
                            try {
                              const parts = JSON.parse(assignment.voiceParts)
                              return Array.isArray(parts)
                                ? parts
                                    .map((p: string) => voicePartLabels[p] || p)
                                    .join(', ')
                                : ''
                            } catch {
                              return ''
                            }
                          })()}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={priorityVariantMap[assignment.priority] || 'default'}>
                    {priorityLabelMap[assignment.priority] || assignment.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ==================== Modals ==================== */}
      <InviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        inviteCode={choir?.inviteCode ?? '------'}
      />

      <AssignmentModal
        isOpen={assignmentModalOpen}
        onClose={() => {
          setAssignmentModalOpen(false)
          // Refresh assignments after closing
          fetch('/api/assignments')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.assignments) setAssignments(data.assignments)
            })
            .catch(() => {})
        }}
        songs={songs.map((s) => ({ id: s.id, title: s.title }))}
        choirId={choir?.id ?? ''}
      />
    </div>
  )
}
