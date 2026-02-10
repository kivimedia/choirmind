import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/assignments — list assignments for user's choir
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

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

    // Verify membership
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

    const assignments = await prisma.assignment.findMany({
      where: { choirId },
      include: {
        song: {
          include: {
            chunks: {
              select: { id: true, label: true, chunkType: true, order: true },
              orderBy: { order: 'asc' },
            },
          },
        },
        assignedBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { targetDate: 'asc' },
        { assignedAt: 'desc' },
      ],
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    console.error('GET /api/assignments error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assignments' },
      { status: 500 }
    )
  }
}

// POST /api/assignments — create an assignment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { songId, choirId, voiceParts, targetDate, priority = 'normal' } = body

    if (!songId) {
      return NextResponse.json(
        { error: 'songId is required' },
        { status: 400 }
      )
    }

    // Determine choirId: from body or from song
    let resolvedChoirId = choirId
    if (!resolvedChoirId) {
      const song = await prisma.song.findUnique({
        where: { id: songId },
        select: { choirId: true },
      })
      if (!song?.choirId) {
        return NextResponse.json(
          { error: 'choirId is required for assignment, or the song must belong to a choir' },
          { status: 400 }
        )
      }
      resolvedChoirId = song.choirId
    }

    // Verify user is a director of this choir
    const membership = await prisma.choirMember.findUnique({
      where: {
        userId_choirId: { userId, choirId: resolvedChoirId },
      },
    })

    if (!membership || membership.role !== 'director') {
      return NextResponse.json(
        { error: 'Only choir directors can create assignments' },
        { status: 403 }
      )
    }

    // Get song chunks
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: {
        chunks: {
          select: { id: true },
        },
      },
    })

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Get choir members (filtered by voice parts if specified)
    let membersFilter: Record<string, unknown> = { choirId: resolvedChoirId }

    const choirMembers = await prisma.choirMember.findMany({
      where: membersFilter,
      include: {
        user: {
          select: { id: true, voicePart: true },
        },
      },
    })

    // Filter by voice parts if specified
    const parsedVoiceParts: string[] | null = voiceParts
      ? Array.isArray(voiceParts)
        ? voiceParts
        : JSON.parse(voiceParts)
      : null

    const targetMembers = parsedVoiceParts
      ? choirMembers.filter(
          (m) => m.user.voicePart && parsedVoiceParts.includes(m.user.voicePart)
        )
      : choirMembers

    // Create assignment and initialize progress for all relevant members
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          songId,
          choirId: resolvedChoirId,
          voiceParts: parsedVoiceParts ? JSON.stringify(parsedVoiceParts) : null,
          targetDate: targetDate ? new Date(targetDate) : null,
          priority,
          assignedById: userId,
        },
        include: {
          song: {
            select: { id: true, title: true },
          },
        },
      })

      // Initialize UserChunkProgress for all target members for all chunks
      const progressEntries: Array<{
        userId: string
        chunkId: string
        fadeLevel: number
        memoryStrength: number
        easeFactor: number
        intervalDays: number
        nextReviewAt: Date
        reviewCount: number
        status: string
      }> = []

      const now = new Date()

      for (const member of targetMembers) {
        for (const chunk of song.chunks) {
          progressEntries.push({
            userId: member.user.id,
            chunkId: chunk.id,
            fadeLevel: 0,
            memoryStrength: 0,
            easeFactor: 2.5,
            intervalDays: 1.0,
            nextReviewAt: now,
            reviewCount: 0,
            status: 'fragile',
          })
        }
      }

      // Create progress entries, skipping any that already exist
      for (const entry of progressEntries) {
        const existing = await tx.userChunkProgress.findUnique({
          where: {
            userId_chunkId: { userId: entry.userId, chunkId: entry.chunkId },
          },
        })
        if (!existing) {
          await tx.userChunkProgress.create({ data: entry })
        }
      }

      return {
        assignment,
        membersInitialized: targetMembers.length,
        chunksPerMember: song.chunks.length,
      }
    })

    return NextResponse.json(
      {
        assignment: result.assignment,
        membersInitialized: result.membersInitialized,
        chunksPerMember: result.chunksPerMember,
        totalProgressEntries:
          result.membersInitialized * result.chunksPerMember,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/assignments error:', error)
    return NextResponse.json(
      { error: 'Failed to create assignment' },
      { status: 500 }
    )
  }
}
