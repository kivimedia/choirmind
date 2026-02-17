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

    // Extract YouTube video ID from URL
    let videoId: string | null = null
    try {
      const urlObj = new URL(youtubeUrl)
      videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop() || null
    } catch {
      // Non-critical
    }

    // Build chunks from lyrics
    const chunkData = lyrics && lyrics.trim()
      ? splitLyricsToChunks(lyrics)
      : [{ label: 'שיר מלא', chunkType: 'verse', order: 0, lyrics: '(טקסט יתווסף מאוחר יותר)' }]

    // ── Check ProcessedVideo cache ────────────────────────────────────
    let audio_s3_key = ''
    let audio_url = ''
    let duration_ms = 0
    let accompanimentUrl: string | null = null
    let cachedWordTimestamps: string | null = null
    let cacheHit = false

    if (videoId) {
      const cached = await prisma.processedVideo.findUnique({
        where: { youtubeVideoId: videoId },
      })

      if (cached) {
        console.log(`[youtube-import] Cache HIT for video ${videoId}`)
        cacheHit = true
        audio_s3_key = cached.fullAudioS3Key
        audio_url = cached.fullAudioUrl
        duration_ms = cached.durationMs ?? 0
        accompanimentUrl = cached.accompanimentUrl
        cachedWordTimestamps = cached.wordTimestamps
        // Increment usage count
        await prisma.processedVideo.update({
          where: { id: cached.id },
          data: { usageCount: { increment: 1 } },
        })
      }
    }

    if (!cacheHit) {
      // ── Step 1: Extract audio from YouTube ───────────────────────────
      console.log(`[youtube-import] Cache MISS — extracting audio from: ${youtubeUrl}`)
      const extractRes = await fetch(`${vocalServiceUrl}/api/v1/youtube-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_url: youtubeUrl }),
        signal: AbortSignal.timeout(200000), // 3+ min for proxy download
      })

      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({ detail: 'Failed to extract audio' }))
        return NextResponse.json({ error: err.detail || 'YouTube audio extraction failed' }, { status: 502 })
      }

      const extractData = await extractRes.json()
      audio_s3_key = extractData.audio_s3_key
      audio_url = extractData.audio_url
      duration_ms = extractData.duration_ms
      console.log(`[youtube-import] Audio extracted: ${audio_s3_key} (${duration_ms}ms)`)

      // ── Step 2: Separate stems ───────────────────────────────────────
      try {
        console.log(`[youtube-import] Separating stems...`)
        const separateRes = await fetch(`${vocalServiceUrl}/api/v1/separate-stems`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3_key: audio_s3_key }),
          signal: AbortSignal.timeout(300000),
        })

        if (separateRes.ok) {
          const separateData = await separateRes.json()
          accompanimentUrl = separateData.accompaniment_url
          console.log(`[youtube-import] Stems separated`)
        } else {
          console.warn(`[youtube-import] Stem separation failed, continuing with full audio only`)
        }
      } catch {
        console.warn(`[youtube-import] Stem separation error`)
      }

      // ── Cache the result ─────────────────────────────────────────────
      if (videoId) {
        try {
          await prisma.processedVideo.create({
            data: {
              youtubeVideoId: videoId,
              title,
              durationMs: duration_ms,
              fullAudioUrl: audio_url,
              fullAudioS3Key: audio_s3_key,
              accompanimentUrl,
            },
          })
          console.log(`[youtube-import] Cached ProcessedVideo for ${videoId}`)
        } catch (e) {
          // Ignore duplicate key errors (race condition)
          console.warn(`[youtube-import] Failed to cache ProcessedVideo:`, e)
        }
      }
    }

    // ── Step 3: Create song + audio tracks ───────────────────────────
    const song = await prisma.song.create({
      data: {
        title,
        language: language || 'he',
        choirId: choirId || null,
        isPersonal: !choirId,
        personalUserId: !choirId ? userId : null,
        youtubeVideoId: videoId,
        source: 'youtube',
        processingStatus: cacheHit ? 'READY' : 'PROCESSING',
        processingStage: cacheHit ? null : 'downloading',
        chunks: { create: chunkData },
      },
      include: { chunks: true },
    })

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

    // ── Step 4: Auto-sync lyrics ─────────────────────────────────────
    // If we have cached word timestamps, apply them directly to chunks
    let syncResult = null
    if (cacheHit && cachedWordTimestamps && lyrics && lyrics.trim()) {
      try {
        const parsedTimestamps = JSON.parse(cachedWordTimestamps)
        // Apply cached timestamps to chunks
        let lineOffset = 0
        for (const chunk of song.chunks) {
          const chunkLines = chunk.lyrics.split('\n').filter((l: string) => l.trim())
          const chunkTimestamps = parsedTimestamps.slice(lineOffset, lineOffset + chunkLines.length)
          if (chunkTimestamps.length > 0) {
            await prisma.chunk.update({
              where: { id: chunk.id },
              data: { wordTimestamps: JSON.stringify(chunkTimestamps) },
            })
          }
          lineOffset += chunkLines.length
        }
        console.log(`[youtube-import] Applied cached word timestamps`)
        syncResult = { cached: true }
      } catch {
        console.warn(`[youtube-import] Failed to apply cached timestamps, falling back to auto-sync`)
      }
    }

    if (!syncResult && lyrics && lyrics.trim()) {
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

          // Update cache with word timestamps if we have a videoId
          if (videoId && syncResult) {
            try {
              // Fetch updated chunks to get timestamps
              const updatedSong = await prisma.song.findUnique({
                where: { id: song.id },
                include: { chunks: { orderBy: { order: 'asc' } } },
              })
              if (updatedSong) {
                const allTimestamps = updatedSong.chunks
                  .filter(c => c.wordTimestamps)
                  .flatMap(c => JSON.parse(c.wordTimestamps!))
                if (allTimestamps.length > 0) {
                  await prisma.processedVideo.update({
                    where: { youtubeVideoId: videoId },
                    data: { wordTimestamps: JSON.stringify(allTimestamps) },
                  })
                }
              }
            } catch {
              // Non-critical
            }
          }
        }
      } catch {
        console.warn(`[youtube-import] Auto-sync failed, continuing without sync`)
      }
    }

    // Mark processing as complete
    await prisma.song.update({
      where: { id: song.id },
      data: { processingStatus: 'READY', processingStage: null, processingError: null },
    })

    invalidateSongsCache()

    return NextResponse.json({
      song: {
        ...song,
        audioTracks: tracks,
      },
      audioImported: true,
      syncResult,
      cacheHit,
    })
  } catch (error) {
    console.error('POST /api/songs/youtube-import error:', error)
    return NextResponse.json({ error: 'YouTube import failed' }, { status: 500 })
  }
}

// Split lyrics into chunks by blank lines
function splitLyricsToChunks(lyrics: string) {
  const sections = lyrics.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
  if (sections.length === 0) {
    return [{ label: 'שיר מלא', chunkType: 'verse', order: 0, lyrics }]
  }

  let verseCount = 1
  return sections.map((section, i) => {
    const firstLine = section.split('\n')[0].trim()

    // Check for Hebrew section headers
    if (/^פזמון\s*[:\-]?\s*/i.test(firstLine)) {
      const body = section.replace(/^פזמון\s*[:\-]?\s*/i, '').trim() || section.split('\n').slice(1).join('\n').trim()
      return { label: 'פזמון', chunkType: 'chorus', order: i, lyrics: body }
    }
    if (/^גשר\s*[:\-]?\s*/i.test(firstLine)) {
      const body = section.replace(/^גשר\s*[:\-]?\s*/i, '').trim() || section.split('\n').slice(1).join('\n').trim()
      return { label: 'גשר', chunkType: 'bridge', order: i, lyrics: body }
    }
    if (/^בית\s*\d*\s*[:\-]?\s*/i.test(firstLine)) {
      const body = section.replace(/^בית\s*\d*\s*[:\-]?\s*/i, '').trim() || section.split('\n').slice(1).join('\n').trim()
      const label = `בית ${verseCount}`
      verseCount++
      return { label, chunkType: 'verse', order: i, lyrics: body }
    }

    const label = `בית ${verseCount}`
    verseCount++
    return { label, chunkType: 'verse', order: i, lyrics: section }
  })
}
