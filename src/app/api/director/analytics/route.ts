import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/director/analytics?choirId=X
// Director-only: choir-wide analytics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const choirId = request.nextUrl.searchParams.get('choirId')
    if (!choirId) {
      return NextResponse.json({ error: 'choirId required' }, { status: 400 })
    }

    // Verify director access
    const membership = await prisma.choirMember.findUnique({
      where: { userId_choirId: { userId, choirId } },
    })
    if (!membership || membership.role !== 'director') {
      return NextResponse.json({ error: 'Director access required' }, { status: 403 })
    }

    // Get member IDs
    const members = await prisma.choirMember.findMany({
      where: { choirId },
      select: {
        userId: true,
        user: { select: { name: true, voicePart: true } },
      },
    })
    const memberIds = members.map((m) => m.userId)

    // Get songs
    const songs = await prisma.song.findMany({
      where: { choirId },
      select: { id: true, title: true },
    })
    const songIds = songs.map((s) => s.id)

    // Get all vocal sessions for these members and songs (last 60 days)
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    const vocalSessions = await prisma.vocalPracticeSession.findMany({
      where: {
        userId: { in: memberIds },
        songId: { in: songIds },
        createdAt: { gte: since },
      },
      select: {
        userId: true,
        songId: true,
        voicePart: true,
        overallScore: true,
        pitchScore: true,
        timingScore: true,
        dynamicsScore: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Get chunk practice sessions
    const chunkSessions = await prisma.practiceSession.findMany({
      where: {
        userId: { in: memberIds },
        startedAt: { gte: since },
      },
      select: {
        userId: true,
        startedAt: true,
        durationSeconds: true,
        xpEarned: true,
      },
    })

    // Aggregate: daily active members
    const dailyActive = new Map<string, Set<string>>()
    for (const s of [...vocalSessions, ...chunkSessions]) {
      const date = ('createdAt' in s ? s.createdAt : s.startedAt).toISOString().slice(0, 10)
      const set = dailyActive.get(date) ?? new Set()
      set.add(s.userId)
      dailyActive.set(date, set)
    }
    const activityTimeline = Array.from(dailyActive.entries())
      .map(([date, users]) => ({ date, activeMembers: users.size }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Per-voice-part average scores
    const partScores = new Map<string, number[]>()
    for (const s of vocalSessions) {
      const arr = partScores.get(s.voicePart) ?? []
      arr.push(s.overallScore)
      partScores.set(s.voicePart, arr)
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0

    const voicePartAvg: Record<string, number> = {}
    for (const [part, scores] of partScores) {
      voicePartAvg[part] = avg(scores)
    }

    // Per-song average scores
    const songScores = new Map<string, number[]>()
    for (const s of vocalSessions) {
      const arr = songScores.get(s.songId) ?? []
      arr.push(s.overallScore)
      songScores.set(s.songId, arr)
    }
    const perSongAvg = songs.map((s) => ({
      songId: s.id,
      title: s.title,
      avgScore: avg(songScores.get(s.id) ?? []),
      sessionCount: (songScores.get(s.id) ?? []).length,
    }))

    // Score trend over time (weekly averages)
    const weeklyScores = new Map<string, number[]>()
    for (const s of vocalSessions) {
      const date = s.createdAt
      const weekStart = new Date(date)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const key = weekStart.toISOString().slice(0, 10)
      const arr = weeklyScores.get(key) ?? []
      arr.push(s.overallScore)
      weeklyScores.set(key, arr)
    }
    const scoreTrend = Array.from(weeklyScores.entries())
      .map(([week, scores]) => ({ week, avgScore: avg(scores), sessions: scores.length }))
      .sort((a, b) => a.week.localeCompare(b.week))

    // Total stats
    const totalVocalSessions = vocalSessions.length
    const totalChunkSessions = chunkSessions.length
    const totalPracticeMinutes = Math.round(
      chunkSessions.reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / 60
    )
    const engagementRate = members.length > 0
      ? Math.round(
          (new Set([
            ...vocalSessions.map((s) => s.userId),
            ...chunkSessions.map((s) => s.userId),
          ]).size / members.length) * 100
        )
      : 0

    return NextResponse.json({
      totalMembers: members.length,
      totalVocalSessions,
      totalChunkSessions,
      totalPracticeMinutes,
      engagementRate,
      activityTimeline,
      voicePartAvg,
      perSongAvg,
      scoreTrend,
    })
  } catch (error) {
    console.error('[director/analytics GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
