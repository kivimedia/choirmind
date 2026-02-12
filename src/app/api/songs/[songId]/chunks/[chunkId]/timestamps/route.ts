import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// PUT /api/songs/[songId]/chunks/[chunkId]/timestamps — save line timestamps for a chunk
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string; chunkId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { songId, chunkId } = await params
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

    // Verify chunk belongs to this song
    const chunk = await prisma.chunk.findFirst({
      where: { id: chunkId, songId },
    })

    if (!chunk) {
      return NextResponse.json({ error: 'Chunk not found' }, { status: 404 })
    }

    const body = await request.json()
    const { timestamps } = body // Array of numbers (ms)

    if (!Array.isArray(timestamps) || timestamps.some((t: unknown) => typeof t !== 'number')) {
      return NextResponse.json(
        { error: 'timestamps must be an array of numbers' },
        { status: 400 }
      )
    }

    // Save timestamps as JSON string (use raw SQL to avoid query engine schema mismatch)
    const timestampsJson = JSON.stringify(timestamps)
    await prisma.$executeRawUnsafe(
      'UPDATE "Chunk" SET "lineTimestamps" = $1 WHERE id = $2',
      timestampsJson,
      chunkId
    )

    return NextResponse.json({ success: true, timestamps })
  } catch (error) {
    console.error('PUT /api/songs/[songId]/chunks/[chunkId]/timestamps error:', error)
    return NextResponse.json(
      { error: 'Failed to save timestamps' },
      { status: 500 }
    )
  }
}
