import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { s3, S3_BUCKET } from '@/lib/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuid } from 'uuid'

const ALLOWED_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// POST /api/songs/[songId]/audio-tracks/presign
// Body: { voicePart, filename, contentType }
// Returns: { uploadUrl, key }
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
    const { voicePart, filename, contentType } = body

    if (!voicePart || !filename || !contentType) {
      return NextResponse.json(
        { error: 'voicePart, filename, and contentType are required' },
        { status: 400 },
      )
    }

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: `Unsupported content type: ${contentType}` },
        { status: 400 },
      )
    }

    // Build S3 key: audio/{songId}/{voicePart}-{uuid}.ext
    const ext = filename.split('.').pop()?.toLowerCase() || 'mp3'
    const key = `audio/${songId}/${voicePart}-${uuid()}.${ext}`

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: MAX_FILE_SIZE, // max size hint
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })

    return NextResponse.json({ uploadUrl, key })
  } catch (error) {
    console.error('[presign POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
