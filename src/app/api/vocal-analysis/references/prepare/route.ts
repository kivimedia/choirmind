import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/vocal-analysis/references/prepare
// Director-only: trigger reference vocal preparation
// Body: { songId, voicePart, sourceTrackId }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { songId, voicePart, sourceTrackId } = body

    if (!songId || !voicePart || !sourceTrackId) {
      return NextResponse.json(
        { error: 'songId, voicePart, and sourceTrackId are required' },
        { status: 400 },
      )
    }

    // Verify the song exists and get its choir
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { id: true, choirId: true },
    })

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    if (!song.choirId) {
      return NextResponse.json(
        { error: 'Reference vocals can only be prepared for choir songs' },
        { status: 400 },
      )
    }

    // Check user is director of the song's choir
    const membership = await prisma.choirMember.findUnique({
      where: {
        userId_choirId: { userId, choirId: song.choirId },
      },
    })

    if (!membership || membership.role !== 'director') {
      return NextResponse.json(
        { error: 'Only directors can prepare reference vocals' },
        { status: 403 },
      )
    }

    // Verify the source track exists and belongs to this song
    const sourceTrack = await prisma.audioTrack.findUnique({
      where: { id: sourceTrackId },
      select: { id: true, songId: true, durationMs: true },
    })

    if (!sourceTrack || sourceTrack.songId !== songId) {
      return NextResponse.json(
        { error: 'Source track not found for this song' },
        { status: 404 },
      )
    }

    // Create ReferenceVocal record in PENDING status
    const reference = await prisma.referenceVocal.create({
      data: {
        songId,
        voicePart,
        sourceTrackId,
        featuresFileUrl: '', // Will be populated by the vocal service
        durationMs: sourceTrack.durationMs ?? 0,
        status: 'PENDING',
      },
    })

    // Fire-and-forget: trigger the Python vocal service
    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (vocalServiceUrl) {
      fetch(`${vocalServiceUrl}/api/v1/prepare-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceId: reference.id,
          songId,
          voicePart,
          sourceTrackId,
        }),
      }).catch((err) => {
        console.error('[vocal-analysis/references/prepare] Failed to trigger vocal service:', err)
      })
    }

    return NextResponse.json({ reference }, { status: 201 })
  } catch (error) {
    console.error('[vocal-analysis/references/prepare POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
