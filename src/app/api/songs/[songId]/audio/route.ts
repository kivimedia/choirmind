import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/songs/[songId]/audio — add an audio track to a song
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
    const body = await request.json()
    const { voicePart, fileUrl, sourceUrl, durationMs } = body

    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 })
    }

    // Verify the song exists
    const song = await prisma.song.findUnique({ where: { id: songId } })
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Skip if this sourceUrl already exists for this song (idempotency)
    if (sourceUrl) {
      const existing = await prisma.audioTrack.findFirst({
        where: { songId, sourceUrl },
      })
      if (existing) {
        return NextResponse.json({ track: existing })
      }
    }

    const track = await prisma.audioTrack.create({
      data: {
        songId,
        voicePart: voicePart || 'full',
        fileUrl,
        sourceUrl: sourceUrl || null,
        durationMs: durationMs || null,
      },
    })

    return NextResponse.json({ track }, { status: 201 })
  } catch (error) {
    console.error('POST /api/songs/[songId]/audio error:', error)
    return NextResponse.json(
      { error: 'Failed to create audio track' },
      { status: 500 }
    )
  }
}
