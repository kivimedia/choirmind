import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { s3, S3_BUCKET } from '@/lib/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { invalidateSongsCache } from '@/lib/songs-cache'

// ---------------------------------------------------------------------------
// Helper: download external audio file and re-host on S3
// ---------------------------------------------------------------------------

async function rehostOnS3(
  externalUrl: string,
  songId: string,
  voicePart: string,
): Promise<string> {
  const res = await fetch(externalUrl, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)

  const contentType = res.headers.get('content-type') ?? 'audio/mpeg'
  const buf = Buffer.from(await res.arrayBuffer())

  // Determine extension from URL
  const urlPath = new URL(externalUrl).pathname
  const urlExt = urlPath.split('.').pop()?.toLowerCase()
  const ext = urlExt && ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'mp4'].includes(urlExt) ? urlExt : 'mp3'

  const key = `audio/${songId}/${voicePart}-${randomUUID()}.${ext}`
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentType,
  }))

  const region = (process.env.AWS_REGION ?? 'us-east-1').trim()
  return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`
}

// POST /api/songs/[songId]/audio — add an audio track to a song
// External URLs are automatically downloaded and re-hosted on S3.
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

    // If the URL is external (not already on our S3), download and re-host
    let finalUrl = fileUrl
    const isExternal = !fileUrl.includes('amazonaws.com')
    if (isExternal && S3_BUCKET) {
      try {
        finalUrl = await rehostOnS3(fileUrl, songId, voicePart || 'full')
      } catch (err) {
        console.error('[audio] S3 rehost failed, using original URL:', err)
        // Fall back to original URL if S3 upload fails
      }
    }

    const track = await prisma.audioTrack.create({
      data: {
        songId,
        voicePart: voicePart || 'full',
        fileUrl: finalUrl,
        sourceUrl: sourceUrl || (isExternal ? fileUrl : null),
        durationMs: durationMs || null,
      },
    })

    invalidateSongsCache()
    return NextResponse.json({ track }, { status: 201 })
  } catch (error) {
    console.error('POST /api/songs/[songId]/audio error:', error)
    return NextResponse.json(
      { error: 'Failed to create audio track' },
      { status: 500 }
    )
  }
}
