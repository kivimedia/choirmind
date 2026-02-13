import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/director/choir-readiness?choirId=X
// Director-only: combined chunk memorization + vocal practice readiness
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

    // Get songs with assignments, chunks, and voice part references
    const songs = await prisma.song.findMany({
      where: { choirId },
      select: {
        id: true,
        title: true,
        targetDate: true,
        chunks: { select: { id: true } },
        assignments: {
          select: { voiceParts: true, targetDate: true },
        },
      },
    })

    // Get members
    const members = await prisma.choirMember.findMany({
      where: { choirId },
      select: {
        userId: true,
        user: { select: { voicePart: true } },
      },
    })

    const memberIds = members.map((m) => m.userId)
    const totalMembers = members.length

    // Get chunk progress for all members
    const chunkIds = songs.flatMap((s) => s.chunks.map((c) => c.id))
    const chunkProgress = await prisma.userChunkProgress.findMany({
      where: {
        userId: { in: memberIds },
        chunkId: { in: chunkIds },
      },
      select: {
        userId: true,
        chunkId: true,
        memoryStrength: true,
        status: true,
      },
    })

    // Get vocal practice sessions (best scores per user per song, last 30 days)
    const vocalSessions = await prisma.vocalPracticeSession.findMany({
      where: {
        userId: { in: memberIds },
        songId: { in: songs.map((s) => s.id) },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        userId: true,
        songId: true,
        voicePart: true,
        overallScore: true,
      },
    })

    // Build per-user best vocal score per song
    const vocalBests = new Map<string, number>() // key: `userId:songId`
    for (const vs of vocalSessions) {
      const key = `${vs.userId}:${vs.songId}`
      const current = vocalBests.get(key) ?? 0
      if (vs.overallScore > current) vocalBests.set(key, vs.overallScore)
    }

    // Build voice-part-level vocal stats per song
    const voicePartScores = new Map<string, number[]>() // key: `songId:voicePart`
    for (const vs of vocalSessions) {
      const key = `${vs.songId}:${vs.voicePart}`
      const arr = voicePartScores.get(key) ?? []
      arr.push(vs.overallScore)
      voicePartScores.set(key, arr)
    }

    // Build chunk progress map: chunkId → progress[]
    const chunkProgressMap = new Map<string, typeof chunkProgress>()
    for (const cp of chunkProgress) {
      const arr = chunkProgressMap.get(cp.chunkId) ?? []
      arr.push(cp)
      chunkProgressMap.set(cp.chunkId, arr)
    }

    // Per-song readiness
    const songReadiness = songs.map((song) => {
      const songChunkIds = song.chunks.map((c) => c.id)
      const totalChunks = songChunkIds.length

      // Chunk memorization readiness: avg memoryStrength across all members × all chunks
      let totalStrength = 0
      let totalPairs = 0
      for (const cId of songChunkIds) {
        const progresses = chunkProgressMap.get(cId) ?? []
        for (const p of progresses) {
          totalStrength += p.memoryStrength
          totalPairs++
        }
        // Members who haven't started get 0
        const missing = totalMembers - progresses.length
        totalPairs += missing
      }
      const chunkReadiness = totalPairs > 0 ? (totalStrength / totalPairs) * 100 : 0

      // Vocal practice readiness: avg best score across members who practiced
      let vocalTotal = 0
      let vocalCount = 0
      for (const mId of memberIds) {
        const best = vocalBests.get(`${mId}:${song.id}`)
        if (best !== undefined) {
          vocalTotal += best
          vocalCount++
        }
      }
      const vocalReadiness = vocalCount > 0 ? vocalTotal / vocalCount : 0
      const vocalCoverage = totalMembers > 0 ? (vocalCount / totalMembers) * 100 : 0

      // Combined readiness: 60% chunk memorization + 40% vocal (weighted by coverage)
      const combined = Math.round(
        chunkReadiness * 0.6 + vocalReadiness * 0.4 * (vocalCoverage / 100)
      )

      // Per-voice-part readiness for this song
      const voiceParts: Record<string, { avgScore: number; memberCount: number }> = {}
      const partMembers = new Map<string, string[]>()
      for (const m of members) {
        if (m.user.voicePart) {
          const arr = partMembers.get(m.user.voicePart) ?? []
          arr.push(m.userId)
          partMembers.set(m.user.voicePart, arr)
        }
      }
      for (const [part, mIds] of partMembers) {
        const scores = voicePartScores.get(`${song.id}:${part}`) ?? []
        voiceParts[part] = {
          avgScore: scores.length > 0
            ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length)
            : 0,
          memberCount: mIds.length,
        }
      }

      // Target date countdown
      const targetDate = song.assignments[0]?.targetDate ?? song.targetDate
      const daysUntil = targetDate
        ? Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null

      return {
        songId: song.id,
        title: song.title,
        totalChunks,
        chunkReadiness: Math.round(chunkReadiness),
        vocalReadiness: Math.round(vocalReadiness),
        vocalCoverage: Math.round(vocalCoverage),
        combined,
        voiceParts,
        targetDate: targetDate?.toISOString() ?? null,
        daysUntil,
      }
    })

    // Overall choir readiness
    const overall = songReadiness.length > 0
      ? Math.round(songReadiness.reduce((s, r) => s + r.combined, 0) / songReadiness.length)
      : 0

    return NextResponse.json({
      overall,
      totalMembers,
      songsCount: songs.length,
      songs: songReadiness,
    })
  } catch (error) {
    console.error('[director/choir-readiness GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
