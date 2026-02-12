import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { s3, S3_BUCKET } from '@/lib/s3'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { invalidateSongsCache } from '@/lib/songs-cache'

// GET /api/songs/[songId]/audio-tracks — list audio tracks for a song
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { songId } = await params

    const audioTracks = await prisma.audioTrack.findMany({
      where: { songId },
      orderBy: { uploadedAt: 'desc' },
    })

    return NextResponse.json({ audioTracks })
  } catch (error) {
    console.error('[audio-tracks GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/songs/[songId]/audio-tracks?trackId=xxx — delete an audio track
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { songId } = await params
    const { searchParams } = new URL(request.url)
    const trackId = searchParams.get('trackId')

    if (!trackId) {
      return NextResponse.json({ error: 'trackId required' }, { status: 400 })
    }

    // Verify the track belongs to this song
    const track = await prisma.audioTrack.findFirst({
      where: { id: trackId, songId },
    })

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    // Delete from S3 if it's an S3 URL
    if (track.fileUrl.includes(S3_BUCKET) && S3_BUCKET) {
      try {
        const url = new URL(track.fileUrl)
        const key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
        await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
      } catch {
        // S3 delete failure is non-critical — still remove from DB
      }
    }

    // Delete from DB
    await prisma.audioTrack.delete({ where: { id: trackId } })

    invalidateSongsCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[audio-tracks DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
