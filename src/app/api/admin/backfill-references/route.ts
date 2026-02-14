import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/admin/backfill-references
// Finds all audio tracks that don't have a ReferenceVocal and triggers creation.
// Requires director role. Processes in batches to avoid timeout.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || (session.user as any).role !== 'director') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (!vocalServiceUrl) {
      return NextResponse.json(
        { error: 'VOCAL_SERVICE_URL not configured' },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(body.batchSize ?? 10, 30)
    const dryRun = body.dryRun ?? false

    // Find audio tracks that don't already have a reference vocal
    // Group by song+voicePart: one reference per unique combo
    const tracksWithoutRef = await prisma.audioTrack.findMany({
      where: {
        song: { choirId: { not: null } },
        referenceVocals: { none: {} },
      },
      select: {
        id: true,
        songId: true,
        voicePart: true,
        fileUrl: true,
        durationMs: true,
      },
      take: batchSize,
    })

    if (tracksWithoutRef.length === 0) {
      return NextResponse.json({
        message: 'All audio tracks already have reference vocals',
        triggered: 0,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        message: `Dry run: would trigger ${tracksWithoutRef.length} reference vocal creations`,
        tracks: tracksWithoutRef.map(t => ({
          trackId: t.id,
          songId: t.songId,
          voicePart: t.voicePart,
        })),
      })
    }

    const results: { trackId: string; songId: string; voicePart: string; referenceId: string }[] = []
    const errors: { trackId: string; error: string }[] = []

    for (const track of tracksWithoutRef) {
      try {
        // Check if a reference already exists for this song+voicePart
        // (another track for same song+voicePart may have been processed above)
        const existing = await prisma.referenceVocal.findFirst({
          where: { songId: track.songId, voicePart: track.voicePart },
        })
        if (existing) continue

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

        // Fire-and-forget: trigger the vocal service
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
          console.error(`[backfill-references] Service call failed for track ${track.id}:`, err)
        })

        results.push({
          trackId: track.id,
          songId: track.songId,
          voicePart: track.voicePart,
          referenceId: reference.id,
        })
      } catch (err) {
        errors.push({
          trackId: track.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      message: `Triggered ${results.length} reference vocal creations`,
      triggered: results.length,
      results,
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (error) {
    console.error('[admin/backfill-references POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
