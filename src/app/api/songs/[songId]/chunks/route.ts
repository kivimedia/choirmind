import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/songs/[songId]/chunks — add chunk to song
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { songId } = await params
    const userId = session.user.id

    // Verify song exists and user has access
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: { chunks: { orderBy: { order: 'desc' }, take: 1 } },
    })

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Verify access
    if (song.isPersonal) {
      if (song.personalUserId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (song.choirId) {
      const membership = await prisma.choirMember.findUnique({
        where: {
          userId_choirId: { userId, choirId: song.choirId },
        },
      })
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { label, chunkType = 'verse', order, lyrics, textDirection, audioStartMs, audioEndMs } = body

    if (!label || !lyrics) {
      return NextResponse.json(
        { error: 'Label and lyrics are required' },
        { status: 400 }
      )
    }

    // If order not specified, append after last chunk
    const chunkOrder = order ?? (song.chunks.length > 0 ? song.chunks[0].order + 1 : 0)

    const chunk = await prisma.chunk.create({
      data: {
        songId,
        label,
        chunkType,
        order: chunkOrder,
        lyrics,
        textDirection: textDirection || song.textDirection,
        audioStartMs: audioStartMs ?? null,
        audioEndMs: audioEndMs ?? null,
      },
    })

    return NextResponse.json({ chunk }, { status: 201 })
  } catch (error) {
    console.error('POST /api/songs/[songId]/chunks error:', error)
    return NextResponse.json(
      { error: 'Failed to add chunk' },
      { status: 500 }
    )
  }
}

// PUT /api/songs/[songId]/chunks — reorder chunks
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { songId } = await params
    const userId = session.user.id

    // Verify song exists and user has access
    const song = await prisma.song.findUnique({
      where: { id: songId },
    })

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Verify access
    if (song.isPersonal) {
      if (song.personalUserId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (song.choirId) {
      const membership = await prisma.choirMember.findUnique({
        where: {
          userId_choirId: { userId, choirId: song.choirId },
        },
      })
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { chunks } = body // Array of { id, order }

    if (!chunks || !Array.isArray(chunks)) {
      return NextResponse.json(
        { error: 'chunks array is required with { id, order } entries' },
        { status: 400 }
      )
    }

    // Update all chunk orders in a transaction
    await prisma.$transaction(
      chunks.map((chunk: { id: string; order: number }) =>
        prisma.chunk.update({
          where: { id: chunk.id },
          data: { order: chunk.order },
        })
      )
    )

    // Return updated chunks
    const updatedChunks = await prisma.chunk.findMany({
      where: { songId },
      orderBy: { order: 'asc' },
    })

    return NextResponse.json({ chunks: updatedChunks })
  } catch (error) {
    console.error('PUT /api/songs/[songId]/chunks error:', error)
    return NextResponse.json(
      { error: 'Failed to reorder chunks' },
      { status: 500 }
    )
  }
}
