import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { invalidateSongsCache } from '@/lib/songs-cache'

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

    if (!label) {
      return NextResponse.json(
        { error: 'Label is required' },
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

    invalidateSongsCache()
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
    const { chunks } = body // Array of { id, order, label?, lyrics? }

    if (!chunks || !Array.isArray(chunks)) {
      return NextResponse.json(
        { error: 'chunks array is required' },
        { status: 400 }
      )
    }

    // Detect lyrics changes so we can auto-clear timestamps
    const existingChunks = await prisma.chunk.findMany({
      where: { songId, id: { in: chunks.map((c: { id: string }) => c.id) } },
      select: { id: true, lyrics: true },
    })
    const existingLyricsMap = new Map(existingChunks.map((c) => [c.id, c.lyrics]))

    // Only clear timestamps when the line structure changed (added/removed lines), not word edits
    const countNonEmpty = (text: string) => text.split('\n').filter((l) => l.trim()).length
    const lyricsChangedIds = chunks
      .filter((chunk: { id: string; lyrics?: string }) => {
        if (chunk.lyrics === undefined) return false
        const oldLyrics = existingLyricsMap.get(chunk.id)
        if (oldLyrics === undefined) return false
        return countNonEmpty(chunk.lyrics) !== countNonEmpty(oldLyrics)
      })
      .map((chunk: { id: string }) => chunk.id)

    // Update all chunks in a transaction
    await prisma.$transaction(
      chunks.map((chunk: { id: string; order?: number; label?: string; lyrics?: string }) =>
        prisma.chunk.update({
          where: { id: chunk.id },
          data: {
            ...(chunk.order !== undefined && { order: chunk.order }),
            ...(chunk.label !== undefined && { label: chunk.label }),
            ...(chunk.lyrics !== undefined && { lyrics: chunk.lyrics }),
          },
        })
      )
    )

    // Auto-clear timestamps for chunks whose lyrics changed (raw SQL to avoid engine mismatch)
    if (lyricsChangedIds.length > 0) {
      try {
        const placeholders = lyricsChangedIds.map((_, i) => `$${i + 1}`).join(',')
        await prisma.$executeRawUnsafe(
          `UPDATE "Chunk" SET "lineTimestamps" = NULL WHERE id IN (${placeholders})`,
          ...lyricsChangedIds
        )
      } catch {
        // Non-critical: timestamps will be stale but re-sync will fix them
      }
    }

    // Return updated chunks
    const updatedChunks = await prisma.chunk.findMany({
      where: { songId },
      orderBy: { order: 'asc' },
    })

    invalidateSongsCache()
    return NextResponse.json({ chunks: updatedChunks })
  } catch (error) {
    console.error('PUT /api/songs/[songId]/chunks error:', error)
    return NextResponse.json(
      { error: 'Failed to reorder chunks' },
      { status: 500 }
    )
  }
}
