import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { s3, S3_BUCKET } from '@/lib/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuid } from 'uuid'

const ALLOWED_CONTENT_TYPES = [
  'audio/webm',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

// POST /api/vocal-analysis/upload
// Accepts FormData with: file (Blob), songId, voicePart
// Returns: { key }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!S3_BUCKET) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 503 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const songId = formData.get('songId') as string | null
    const voicePart = formData.get('voicePart') as string | null

    if (!file || !songId || !voicePart) {
      return NextResponse.json(
        { error: 'file, songId, and voicePart are required' },
        { status: 400 },
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large (max 50MB)' },
        { status: 400 },
      )
    }

    const baseType = file.type.split(';')[0].trim()
    if (!ALLOWED_CONTENT_TYPES.includes(baseType)) {
      return NextResponse.json(
        { error: `Unsupported content type: ${file.type}. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const userId = session.user.id
    const ext = baseType.includes('webm') ? 'webm' : baseType.includes('wav') ? 'wav' : baseType.includes('ogg') ? 'ogg' : 'mp4'
    const key = `vocal-recordings/${userId}/${songId}/${uuid()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: baseType,
    }))

    return NextResponse.json({ key })
  } catch (error) {
    console.error('[vocal-analysis/upload POST]', error)
    const msg = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
