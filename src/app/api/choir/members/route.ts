import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/choir/members — list choir members with progress stats
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get choirId from query params, or default to user's first choir
    const { searchParams } = new URL(request.url)
    let choirId = searchParams.get('choirId')

    if (!choirId) {
      const firstMembership = await prisma.choirMember.findFirst({
        where: { userId },
        select: { choirId: true },
      })
      if (!firstMembership) {
        return NextResponse.json(
          { error: 'You are not a member of any choir' },
          { status: 404 }
        )
      }
      choirId = firstMembership.choirId
    }

    // Verify the requesting user is a member of this choir
    const membership = await prisma.choirMember.findUnique({
      where: {
        userId_choirId: { userId, choirId },
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this choir' },
        { status: 403 }
      )
    }

    // Get all members with user info
    const members = await prisma.choirMember.findMany({
      where: { choirId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            voicePart: true,
            xp: true,
            currentStreak: true,
            lastPracticeDate: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })

    // Get all choir songs and their chunks for readiness calculation
    const choirSongs = await prisma.song.findMany({
      where: { choirId },
      include: {
        chunks: {
          select: { id: true },
        },
      },
    })

    const totalChunks = choirSongs.reduce(
      (sum, song) => sum + song.chunks.length,
      0
    )
    const allChunkIds = choirSongs.flatMap((song) =>
      song.chunks.map((c) => c.id)
    )

    // Get progress for all members on choir songs
    const allProgress = await prisma.userChunkProgress.findMany({
      where: {
        userId: { in: members.map((m) => m.userId) },
        chunkId: { in: allChunkIds },
      },
      select: {
        userId: true,
        chunkId: true,
        status: true,
        fadeLevel: true,
        memoryStrength: true,
      },
    })

    // Build a map of userId -> progress stats
    const progressByUser = new Map<
      string,
      { total: number; solid: number; avgFadeLevel: number; avgMemoryStrength: number }
    >()

    for (const member of members) {
      const userProgress = allProgress.filter((p) => p.userId === member.userId)
      const solidCount = userProgress.filter(
        (p) => p.status === 'solid' || p.status === 'locked_in'
      ).length
      const avgFadeLevel =
        userProgress.length > 0
          ? userProgress.reduce((sum, p) => sum + p.fadeLevel, 0) /
            userProgress.length
          : 0
      const avgMemoryStrength =
        userProgress.length > 0
          ? userProgress.reduce((sum, p) => sum + p.memoryStrength, 0) /
            userProgress.length
          : 0

      progressByUser.set(member.userId, {
        total: userProgress.length,
        solid: solidCount,
        avgFadeLevel: Math.round(avgFadeLevel * 100) / 100,
        avgMemoryStrength: Math.round(avgMemoryStrength * 100) / 100,
      })
    }

    // Assemble response
    const membersWithProgress = members.map((m) => {
      const stats = progressByUser.get(m.userId) || {
        total: 0,
        solid: 0,
        avgFadeLevel: 0,
        avgMemoryStrength: 0,
      }

      return {
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
        songReadiness: {
          totalChunksInChoir: totalChunks,
          chunksStarted: stats.total,
          chunksSolid: stats.solid,
          readinessPercent:
            totalChunks > 0
              ? Math.round((stats.solid / totalChunks) * 100)
              : 0,
          avgFadeLevel: stats.avgFadeLevel,
          avgMemoryStrength: stats.avgMemoryStrength,
        },
      }
    })

    return NextResponse.json({ members: membersWithProgress, choirId })
  } catch (error) {
    console.error('GET /api/choir/members error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch choir members' },
      { status: 500 }
    )
  }
}
