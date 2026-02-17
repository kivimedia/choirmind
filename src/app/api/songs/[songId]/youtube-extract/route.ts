import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { invalidateSongsCache } from '@/lib/songs-cache'

// POST /api/songs/[songId]/youtube-extract — extract audio from YouTube for an existing song
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
    const userId = session.user.id

    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (!vocalServiceUrl) {
      return NextResponse.json({ error: 'Vocal service not configured' }, { status: 500 })
    }

    // Fetch song
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: { audioTracks: true },
    })

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Verify access
    if (song.isPersonal) {
      if (song.personalUserId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (song.choirId) {
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId, choirId: song.choirId } },
      })
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (!song.youtubeVideoId) {
      return NextResponse.json({ error: 'Song has no YouTube video ID' }, { status: 400 })
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${song.youtubeVideoId}`

    // Set processing status
    await prisma.song.update({
      where: { id: songId },
      data: { processingStatus: 'PROCESSING', processingStage: 'downloading', processingError: null },
    })

    // ── Check ProcessedVideo cache ────────────────────────────────────
    let audio_s3_key: string
    let audio_url: string
    let duration_ms: number
    let accompanimentUrl: string | null = null
    let cacheHit = false

    const cached = await prisma.processedVideo.findUnique({
      where: { youtubeVideoId: song.youtubeVideoId },
    })

    if (cached) {
      console.log(`[youtube-extract] Cache HIT for video ${song.youtubeVideoId}`)
      cacheHit = true
      audio_s3_key = cached.fullAudioS3Key
      audio_url = cached.fullAudioUrl
      duration_ms = cached.durationMs ?? 0
      accompanimentUrl = cached.accompanimentUrl
      await prisma.processedVideo.update({
        where: { id: cached.id },
        data: { usageCount: { increment: 1 } },
      })
    } else {
      // ── Step 1: Extract audio from YouTube ───────────────────────────
      console.log(`[youtube-extract] Cache MISS — extracting audio from: ${youtubeUrl}`)
      const extractRes = await fetch(`${vocalServiceUrl}/api/v1/youtube-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_url: youtubeUrl }),
        signal: AbortSignal.timeout(200000),
      })

      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({ detail: 'Failed to extract audio' }))
        return NextResponse.json({ error: err.detail || 'YouTube audio extraction failed' }, { status: 502 })
      }

      const extractData = await extractRes.json()
      audio_s3_key = extractData.audio_s3_key
      audio_url = extractData.audio_url
      duration_ms = extractData.duration_ms
      console.log(`[youtube-extract] Audio extracted: ${audio_s3_key} (${duration_ms}ms)`)

      // ── Step 2: Separate stems ───────────────────────────────────────
      await prisma.song.update({
        where: { id: songId },
        data: { processingStage: 'separating' },
      })
      try {
        console.log(`[youtube-extract] Separating stems...`)
        const separateRes = await fetch(`${vocalServiceUrl}/api/v1/separate-stems`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3_key: audio_s3_key }),
          signal: AbortSignal.timeout(300000),
        })

        if (separateRes.ok) {
          const separateData = await separateRes.json()
          accompanimentUrl = separateData.accompaniment_url
          console.log(`[youtube-extract] Stems separated`)
        } else {
          console.warn(`[youtube-extract] Stem separation failed, continuing with full audio only`)
        }
      } catch {
        console.warn(`[youtube-extract] Stem separation error`)
      }

      // ── Cache the result ─────────────────────────────────────────────
      try {
        await prisma.processedVideo.create({
          data: {
            youtubeVideoId: song.youtubeVideoId,
            title: song.title,
            durationMs: duration_ms,
            fullAudioUrl: audio_url,
            fullAudioS3Key: audio_s3_key,
            accompanimentUrl,
          },
        })
        console.log(`[youtube-extract] Cached ProcessedVideo for ${song.youtubeVideoId}`)
      } catch (e) {
        console.warn(`[youtube-extract] Failed to cache ProcessedVideo:`, e)
      }
    }

    // ── Step 3: Create audio tracks ──────────────────────────────────
    const tracks = []

    // Full mix track
    tracks.push(
      await prisma.audioTrack.create({
        data: {
          songId: song.id,
          voicePart: 'full',
          fileUrl: audio_url,
          sourceUrl: youtubeUrl,
          durationMs: duration_ms,
        },
      })
    )

    // Playback (accompaniment) track
    if (accompanimentUrl) {
      tracks.push(
        await prisma.audioTrack.create({
          data: {
            songId: song.id,
            voicePart: 'playback',
            fileUrl: accompanimentUrl,
            sourceUrl: youtubeUrl,
            durationMs: duration_ms,
          },
        })
      )
    }

    // Mark processing complete
    await prisma.song.update({
      where: { id: songId },
      data: { processingStatus: 'READY', processingStage: null, processingError: null },
    })

    invalidateSongsCache()

    return NextResponse.json({ tracks, cacheHit })
  } catch (error) {
    console.error('POST /api/songs/[songId]/youtube-extract error:', error)
    // Mark as failed
    try {
      const { songId } = await params
      await prisma.song.update({
        where: { id: songId },
        data: {
          processingStatus: 'FAILED',
          processingError: error instanceof Error ? error.message : 'YouTube extraction failed',
        },
      })
    } catch { /* non-critical */ }
    return NextResponse.json({ error: 'YouTube audio extraction failed' }, { status: 500 })
  }
}
