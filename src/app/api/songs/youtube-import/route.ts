import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { invalidateSongsCache } from '@/lib/songs-cache'

// POST /api/songs/youtube-import — import a song from YouTube
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { youtubeUrl, title, choirId, lyrics, language } = body

    if (!youtubeUrl || typeof youtubeUrl !== 'string') {
      return NextResponse.json({ error: 'youtubeUrl is required' }, { status: 400 })
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (!vocalServiceUrl) {
      return NextResponse.json({ error: 'Vocal service not configured' }, { status: 500 })
    }

    const userId = session.user.id

    // Verify choir membership if choirId provided
    if (choirId) {
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId, choirId } },
      })
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Step 1: Extract audio from YouTube via vocal service
    console.log(`[youtube-import] Extracting audio from: ${youtubeUrl}`)
    const extractRes = await fetch(`${vocalServiceUrl}/api/v1/youtube-extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url: youtubeUrl }),
      signal: AbortSignal.timeout(180000), // 3 min timeout
    })

    if (!extractRes.ok) {
      const err = await extractRes.json().catch(() => ({ detail: 'Failed to extract audio' }))
      return NextResponse.json({ error: err.detail || 'YouTube extraction failed' }, { status: 502 })
    }

    const extractData = await extractRes.json()
    const { audio_s3_key, audio_url, duration_ms } = extractData

    console.log(`[youtube-import] Audio extracted: ${audio_s3_key} (${duration_ms}ms)`)

    // Step 2: Separate stems via vocal service
    console.log(`[youtube-import] Separating stems...`)
    const separateRes = await fetch(`${vocalServiceUrl}/api/v1/separate-stems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3_key: audio_s3_key }),
      signal: AbortSignal.timeout(300000), // 5 min timeout
    })

    let vocalsUrl: string | null = null
    let accompanimentUrl: string | null = null
    if (separateRes.ok) {
      const separateData = await separateRes.json()
      vocalsUrl = separateData.vocals_url
      accompanimentUrl = separateData.accompaniment_url
      console.log(`[youtube-import] Stems separated`)
    } else {
      console.warn(`[youtube-import] Stem separation failed, continuing with full audio only`)
    }

    // Extract YouTube video ID from URL
    let videoId: string | null = null
    try {
      const urlObj = new URL(youtubeUrl)
      videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop() || null
    } catch {
      // Non-critical
    }

    // Step 3: Create song with audio tracks
    const song = await prisma.song.create({
      data: {
        title,
        language: language || 'he',
        choirId: choirId || null,
        isPersonal: !choirId,
        personalUserId: !choirId ? userId : null,
        youtubeVideoId: videoId,
        source: 'youtube',
        chunks: {
          create: lyrics
            ? [{
                label: 'שיר מלא',
                chunkType: 'verse',
                order: 0,
                lyrics,
              }]
            : [{
                label: 'שיר מלא',
                chunkType: 'verse',
                order: 0,
                lyrics: '(טקסט יתווסף מאוחר יותר)',
              }],
        },
      },
      include: { chunks: true },
    })

    // Create audio tracks
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

    // Step 4: Auto-sync lyrics if we have lyrics and audio
    let syncResult = null
    if (lyrics && lyrics.trim()) {
      try {
        const baseUrl = process.env.NEXTAUTH_URL || ''
        const syncRes = await fetch(`${baseUrl}/api/songs/${song.id}/auto-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ audioTrackId: tracks[0].id }),
        })
        if (syncRes.ok) {
          syncResult = await syncRes.json()
          console.log(`[youtube-import] Auto-sync completed`)
        }
      } catch {
        console.warn(`[youtube-import] Auto-sync failed, continuing without sync`)
      }
    }

    invalidateSongsCache()

    return NextResponse.json({
      song: {
        ...song,
        audioTracks: tracks,
      },
      syncResult,
    })
  } catch (error) {
    console.error('POST /api/songs/youtube-import error:', error)
    return NextResponse.json({ error: 'YouTube import failed' }, { status: 500 })
  }
}
