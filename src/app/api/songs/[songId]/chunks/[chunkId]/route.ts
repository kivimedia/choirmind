import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { invalidateSongsCache } from '@/lib/songs-cache'

// DELETE /api/songs/[songId]/chunks/[chunkId] — delete a single chunk
export async function DELETE(
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

    await prisma.chunk.delete({ where: { id: chunkId } })

    invalidateSongsCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/songs/[songId]/chunks/[chunkId] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete chunk' },
      { status: 500 }
    )
  }
}
