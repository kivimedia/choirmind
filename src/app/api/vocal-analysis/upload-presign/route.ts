import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { s3, S3_BUCKET } from '@/lib/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuid } from 'uuid'

const ALLOWED_CONTENT_TYPES = [
  'audio/webm',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
]

// POST /api/vocal-analysis/upload-presign
// Body: { songId, voicePart, filename, contentType, durationMs }
// Returns: { uploadUrl, key }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!S3_BUCKET) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 503 })
    }

    const body = await request.json()
    const { songId, voicePart, filename, contentType, durationMs } = body

    if (!songId || !voicePart || !filename || !contentType) {
      return NextResponse.json(
        { error: 'songId, voicePart, filename, and contentType are required' },
        { status: 400 },
      )
    }

    const baseType = contentType.split(';')[0].trim()
    if (!ALLOWED_CONTENT_TYPES.includes(baseType)) {
      return NextResponse.json(
        { error: `Unsupported content type: ${contentType}. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    if (durationMs !== undefined && (typeof durationMs !== 'number' || durationMs <= 0)) {
      return NextResponse.json(
        { error: 'durationMs must be a positive number' },
        { status: 400 },
      )
    }

    const userId = session.user.id
    const ext = filename.split('.').pop()?.toLowerCase() || 'webm'
    const key = `vocal-recordings/${userId}/${songId}/${uuid()}.${ext}`

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: baseType,
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })

    return NextResponse.json({ uploadUrl, key })
  } catch (error) {
    console.error('[vocal-analysis/upload-presign POST]', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
