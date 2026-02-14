import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { s3, S3_BUCKET } from '@/lib/s3'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { invalidateSongsCache } from '@/lib/songs-cache'

// POST /api/songs/[songId]/audio-tracks/confirm
// Body: { key, voicePart, durationMs? }
// Creates AudioTrack record after confirming the S3 object exists
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!S3_BUCKET) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 503 })
    }

    const { songId } = await params
    const body = await request.json()
    const { key, voicePart, durationMs } = body

    if (!key || !voicePart) {
      return NextResponse.json(
        { error: 'key and voicePart are required' },
        { status: 400 },
      )
    }

    // Verify the song exists
    const song = await prisma.song.findUnique({ where: { id: songId } })
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Verify the S3 object exists
    try {
      await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }))
    } catch {
      return NextResponse.json(
        { error: 'S3 object not found - upload may have failed' },
        { status: 404 },
      )
    }

    // Build the public URL
    const region = process.env.AWS_REGION ?? 'eu-west-1'
    const fileUrl = `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`

    // Create the AudioTrack record
    const audioTrack = await prisma.audioTrack.create({
      data: {
        songId,
        voicePart,
        fileUrl,
        durationMs: durationMs ? Math.round(durationMs) : null,
      },
    })

    invalidateSongsCache()

    // Auto-trigger reference vocal creation (Demucs isolation + feature extraction)
    // so it's ready before any user tries to record against this track.
    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (vocalServiceUrl) {
      // Create a PENDING ReferenceVocal record
      const reference = await prisma.referenceVocal.create({
        data: {
          songId,
          voicePart,
          sourceTrackId: audioTrack.id,
          featuresFileUrl: '',
          durationMs: durationMs ? Math.round(durationMs) : 0,
          status: 'PENDING',
        },
      }).catch((e) => {
        console.error('[confirm] Failed to create ReferenceVocal record:', e)
        return null
      })

      if (reference) {
        // Fire-and-forget: trigger the vocal service
        fetch(`${vocalServiceUrl}/api/v1/prepare-reference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceVocalId: reference.id,
            songId,
            voicePart,
            sourceTrackId: audioTrack.id,
            audioFileUrl: fileUrl,
          }),
        }).catch((err) => {
          console.error('[confirm] Failed to trigger reference vocal creation:', err)
        })
      }
    }

    return NextResponse.json({ audioTrack })
  } catch (error) {
    console.error('[confirm POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
