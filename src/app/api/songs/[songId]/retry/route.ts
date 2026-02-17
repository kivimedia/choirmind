import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { invalidateSongsCache } from '@/lib/songs-cache'

// POST /api/songs/[songId]/retry — retry failed processing
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { songId } = await params
    const userId = session.user.id

    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: { audioTracks: true },
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

    if (song.processingStatus !== 'FAILED') {
      return NextResponse.json({ error: 'Song is not in failed state' }, { status: 400 })
    }

    // Reset processing status
    await prisma.song.update({
      where: { id: songId },
      data: {
        processingStatus: 'PENDING',
        processingStage: null,
        processingError: null,
      },
    })

    // Re-trigger YouTube extraction if song has a YouTube video ID and no audio tracks
    if (song.youtubeVideoId && song.audioTracks.length === 0) {
      const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
      if (vocalServiceUrl) {
        // Fire and forget — the youtube-extract route handles the processing
        const baseUrl = process.env.NEXTAUTH_URL || ''
        fetch(`${baseUrl}/api/songs/${songId}/youtube-extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {
          // Non-critical
        })
      }
    }

    invalidateSongsCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/songs/[songId]/retry error:', error)
    return NextResponse.json({ error: 'Retry failed' }, { status: 500 })
  }
}
