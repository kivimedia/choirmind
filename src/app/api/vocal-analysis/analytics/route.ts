import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/vocal-analysis/analytics
// Personal vocal analytics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const songId = request.nextUrl.searchParams.get('songId')

    // Fetch all sessions (optionally filtered by songId)
    const sessions = await prisma.vocalPracticeSession.findMany({
      where: {
        userId,
        ...(songId ? { songId } : {}),
      },
      select: {
        id: true,
        songId: true,
        voicePart: true,
        overallScore: true,
        pitchScore: true,
        timingScore: true,
        dynamicsScore: true,
        sectionScores: true,
        createdAt: true,
        song: { select: { title: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (sessions.length === 0) {
      return NextResponse.json({
        totalSessions: 0,
        scoreHistory: [],
        perSongStats: [],
        consistency: null,
        improvementRate: null,
      })
    }

    // Score history (for charts)
    const scoreHistory = sessions.map((s) => ({
      date: s.createdAt.toISOString(),
      songId: s.songId,
      songTitle: s.song.title,
      overallScore: s.overallScore,
      pitchScore: s.pitchScore,
      timingScore: s.timingScore,
      dynamicsScore: s.dynamicsScore,
    }))

    // Per-song aggregated stats
    const songMap = new Map<string, {
      title: string
      scores: number[]
      pitchScores: number[]
      timingScores: number[]
      dynamicsScores: number[]
    }>()

    for (const s of sessions) {
      let entry = songMap.get(s.songId)
      if (!entry) {
        entry = {
          title: s.song.title,
          scores: [],
          pitchScores: [],
          timingScores: [],
          dynamicsScores: [],
        }
        songMap.set(s.songId, entry)
      }
      entry.scores.push(s.overallScore)
      entry.pitchScores.push(s.pitchScore)
      entry.timingScores.push(s.timingScore)
      entry.dynamicsScores.push(s.dynamicsScore)
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const stdDev = (arr: number[]) => {
      if (arr.length < 2) return 0
      const mean = avg(arr)
      return Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length)
    }

    const perSongStats = Array.from(songMap.entries()).map(([id, data]) => ({
      songId: id,
      title: data.title,
      sessionCount: data.scores.length,
      avgScore: Math.round(avg(data.scores)),
      bestScore: Math.round(Math.max(...data.scores)),
      avgPitch: Math.round(avg(data.pitchScores)),
      avgTiming: Math.round(avg(data.timingScores)),
      avgDynamics: Math.round(avg(data.dynamicsScores)),
      consistency: Math.round(100 - stdDev(data.scores)),
    }))

    // Overall consistency (100 - std deviation of scores)
    const allScores = sessions.map((s) => s.overallScore)
    const consistency = Math.round(100 - stdDev(allScores))

    // Improvement rate: linear regression slope of scores over time
    let improvementRate = 0
    if (sessions.length >= 3) {
      const n = sessions.length
      const xs = sessions.map((_, i) => i)
      const ys = sessions.map((s) => s.overallScore)
      const xMean = avg(xs)
      const yMean = avg(ys)
      const num = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0)
      const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0)
      improvementRate = den !== 0 ? Math.round((num / den) * 100) / 100 : 0
    }

    // Vocal range from section scores (extract pitch data)
    let pitchRange: { min: number; max: number } | null = null
    for (const s of sessions) {
      try {
        const sections = JSON.parse(s.sectionScores)
        for (const sec of Array.isArray(sections) ? sections : []) {
          if (sec.minPitch && sec.maxPitch) {
            if (!pitchRange) {
              pitchRange = { min: sec.minPitch, max: sec.maxPitch }
            } else {
              pitchRange.min = Math.min(pitchRange.min, sec.minPitch)
              pitchRange.max = Math.max(pitchRange.max, sec.maxPitch)
            }
          }
        }
      } catch {}
    }

    return NextResponse.json({
      totalSessions: sessions.length,
      scoreHistory,
      perSongStats,
      consistency,
      improvementRate,
      pitchRange,
    })
  } catch (error) {
    console.error('[vocal-analysis/analytics GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
