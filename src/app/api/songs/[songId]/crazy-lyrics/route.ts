import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateCrazyLyrics, extractLinesFromChunks } from '@/lib/generate-crazy-lyrics'

// POST /api/songs/[songId]/crazy-lyrics — generate absurd alternative lyrics
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

    // Fetch song with chunks
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: {
        chunks: {
          orderBy: { order: 'asc' },
          select: { id: true, wordTimestamps: true, lyrics: true },
        },
      },
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
        where: { userId_choirId: { userId, choirId: song.choirId } },
      })
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Build lines-of-words from word timestamps
    const lines = extractLinesFromChunks(song.chunks)
    if (lines.length === 0) {
      return NextResponse.json({ error: 'Song has no word timestamps' }, { status: 400 })
    }

    const validated = await generateCrazyLyrics(lines, song.language, song.title)

    // Save to database
    await prisma.song.update({
      where: { id: songId },
      data: { crazyLyrics: JSON.stringify(validated) },
    })

    return NextResponse.json({ crazyLines: validated })
  } catch (error) {
    console.error('POST /api/songs/[songId]/crazy-lyrics error:', error)
    return NextResponse.json({ error: 'Crazy lyrics generation failed' }, { status: 500 })
  }
}
