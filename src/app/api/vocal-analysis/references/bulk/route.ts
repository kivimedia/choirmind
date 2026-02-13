import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/vocal-analysis/references/bulk
// Director-only: queue Demucs reference preparation for multiple songs
// Body: { songIds: string[] } or { choirId: string } (all songs)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { songIds, choirId } = body

    // Determine which songs to process
    let targetSongIds: string[] = []

    if (songIds && Array.isArray(songIds)) {
      targetSongIds = songIds
    } else if (choirId) {
      // Verify user is director of the choir
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId, choirId } },
      })
      if (!membership || membership.role !== 'director') {
        return NextResponse.json({ error: 'Director access required' }, { status: 403 })
      }

      const songs = await prisma.song.findMany({
        where: { choirId },
        select: { id: true },
      })
      targetSongIds = songs.map((s) => s.id)
    } else {
      return NextResponse.json(
        { error: 'songIds or choirId is required' },
        { status: 400 },
      )
    }

    if (targetSongIds.length === 0) {
      return NextResponse.json({ queued: 0 })
    }

    // For each song, find audio tracks that don't have READY references
    const tracks = await prisma.audioTrack.findMany({
      where: {
        songId: { in: targetSongIds },
      },
      select: {
        id: true,
        songId: true,
        voicePart: true,
        fileUrl: true,
        durationMs: true,
        referenceVocals: {
          where: { status: { in: ['READY', 'PROCESSING', 'PENDING'] } },
          select: { id: true },
        },
      },
    })

    // Filter to tracks without any active reference
    const tracksToProcess = tracks.filter((t) => t.referenceVocals.length === 0)

    let queued = 0
    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL

    for (const track of tracksToProcess) {
      try {
        // Create ReferenceVocal record
        const reference = await prisma.referenceVocal.create({
          data: {
            songId: track.songId,
            voicePart: track.voicePart,
            sourceTrackId: track.id,
            featuresFileUrl: '',
            durationMs: track.durationMs ?? 0,
            status: 'PENDING',
          },
        })

        // Fire-and-forget to vocal service
        if (vocalServiceUrl) {
          fetch(`${vocalServiceUrl}/api/v1/prepare-reference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referenceVocalId: reference.id,
              songId: track.songId,
              voicePart: track.voicePart,
              sourceTrackId: track.id,
              audioFileUrl: track.fileUrl,
            }),
          }).catch((err) => {
            console.error('[references/bulk] Failed to trigger vocal service:', err)
          })
        }

        queued++
      } catch (err) {
        // Skip duplicate references (unique constraint)
        console.error('[references/bulk] Error creating reference:', err)
      }
    }

    return NextResponse.json({
      queued,
      totalTracks: tracks.length,
      skipped: tracks.length - tracksToProcess.length,
    })
  } catch (error) {
    console.error('[references/bulk POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
