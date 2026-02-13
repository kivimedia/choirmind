import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { s3, S3_BUCKET } from '@/lib/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

// POST /api/admin/migrate-audio
// Downloads audio tracks from external URLs (Wix etc.) and re-hosts them on S3.
// Requires director role. Processes in batches to avoid timeout.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || (session.user as any).role !== 'director') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(body.batchSize ?? 20, 50)
    const dryRun = body.dryRun ?? false

    // Find tracks with external (non-S3) URLs
    const tracks = await prisma.audioTrack.findMany({
      where: {
        NOT: { fileUrl: { contains: 'amazonaws.com' } },
      },
      take: batchSize,
      select: { id: true, songId: true, voicePart: true, fileUrl: true },
    })

    if (tracks.length === 0) {
      return NextResponse.json({ message: 'All tracks already on S3', migrated: 0, remaining: 0 })
    }

    const region = (process.env.AWS_REGION ?? 'us-east-1').trim()
    const results: { id: string; status: string; oldUrl: string; newUrl?: string }[] = []

    for (const track of tracks) {
      try {
        if (dryRun) {
          results.push({ id: track.id, status: 'dry-run', oldUrl: track.fileUrl })
          continue
        }

        // Download from external URL
        const response = await fetch(track.fileUrl, { signal: AbortSignal.timeout(30_000) })
        if (!response.ok) {
          results.push({ id: track.id, status: `download-failed-${response.status}`, oldUrl: track.fileUrl })
          continue
        }

        const contentType = response.headers.get('content-type') ?? 'audio/mpeg'
        const buffer = Buffer.from(await response.arrayBuffer())

        // Determine extension from URL or content type
        let ext = 'mp3'
        const urlPath = new URL(track.fileUrl).pathname
        const urlExt = urlPath.split('.').pop()?.toLowerCase()
        if (urlExt && ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'mp4'].includes(urlExt)) {
          ext = urlExt
        }

        // Upload to S3
        const key = `audio/${track.songId}/${track.voicePart}-${randomUUID()}.${ext}`
        await s3.send(new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }))

        const newUrl = `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`

        // Update database — keep original URL as sourceUrl
        await prisma.audioTrack.update({
          where: { id: track.id },
          data: {
            fileUrl: newUrl,
            sourceUrl: track.fileUrl,
          },
        })

        results.push({ id: track.id, status: 'migrated', oldUrl: track.fileUrl, newUrl })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error'
        results.push({ id: track.id, status: `error: ${msg}`, oldUrl: track.fileUrl })
      }
    }

    // Count remaining
    const remaining = await prisma.audioTrack.count({
      where: { NOT: { fileUrl: { contains: 'amazonaws.com' } } },
    })

    return NextResponse.json({
      migrated: results.filter(r => r.status === 'migrated').length,
      failed: results.filter(r => r.status !== 'migrated' && r.status !== 'dry-run').length,
      remaining,
      results,
    })
  } catch (error) {
    console.error('[admin/migrate-audio]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 },
    )
  }
}
