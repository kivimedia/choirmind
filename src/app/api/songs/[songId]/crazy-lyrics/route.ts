import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (!vocalServiceUrl) {
      return NextResponse.json({ error: 'Vocal service not configured' }, { status: 500 })
    }

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
    const lines: string[][] = []
    for (const chunk of song.chunks) {
      if (!chunk.wordTimestamps) continue
      const parsed = JSON.parse(chunk.wordTimestamps) as { word: string }[][]
      for (const line of parsed) {
        if (line.length > 0) {
          lines.push(line.map((w) => w.word))
        }
      }
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: 'Song has no word timestamps' }, { status: 400 })
    }

    // Call vocal service
    const res = await fetch(`${vocalServiceUrl}/api/v1/crazy-lyrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, language: song.language }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to generate crazy lyrics' }))
      return NextResponse.json({ error: err.detail || 'Crazy lyrics generation failed' }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({ crazyLines: data.crazy_lines })
  } catch (error) {
    console.error('POST /api/songs/[songId]/crazy-lyrics error:', error)
    return NextResponse.json({ error: 'Crazy lyrics generation failed' }, { status: 500 })
  }
}
