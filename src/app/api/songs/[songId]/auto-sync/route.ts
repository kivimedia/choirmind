import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { alignLyricsToTranscript } from '@/lib/lyrics-align'
import OpenAI from 'openai'
import { invalidateSongsCache } from '@/lib/songs-cache'

// POST /api/songs/[songId]/auto-sync — AI-powered lyrics sync using Whisper
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Add OPENAI_API_KEY to .env' },
        { status: 500 }
      )
    }

    const { songId } = await params
    const userId = session.user.id

    const body = await request.json()
    const { audioTrackId } = body

    if (!audioTrackId) {
      return NextResponse.json({ error: 'audioTrackId is required' }, { status: 400 })
    }

    // Fetch song with chunks and audio tracks
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: {
        chunks: { orderBy: { order: 'asc' } },
        audioTracks: true,
      },
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

    // Find the audio track
    const audioTrack = song.audioTracks.find((t) => t.id === audioTrackId)
    if (!audioTrack) {
      return NextResponse.json({ error: 'Audio track not found' }, { status: 404 })
    }

    // Filter chunks that have lyrics
    const chunksWithLyrics = song.chunks.filter(
      (c) => c.lyrics && c.lyrics.split('\n').filter((l: string) => l.trim()).length > 0
    )

    if (chunksWithLyrics.length === 0) {
      return NextResponse.json({ error: 'No chunks with lyrics to sync' }, { status: 400 })
    }

    // Download audio from S3
    console.log(`[auto-sync] Downloading audio from: ${audioTrack.fileUrl}`)
    const audioRes = await fetch(audioTrack.fileUrl, {
      signal: AbortSignal.timeout(30000),
    })
    if (!audioRes.ok) {
      return NextResponse.json({ error: 'Failed to download audio file' }, { status: 502 })
    }

    const audioBuffer = await audioRes.arrayBuffer()
    const audioBlob = new Blob([audioBuffer])

    // Determine file extension from URL
    const urlPath = new URL(audioTrack.fileUrl).pathname
    const ext = urlPath.split('.').pop() || 'mp3'
    const filename = `audio.${ext}`

    // Create a File object for the OpenAI SDK
    const audioFile = new File([audioBlob], filename, {
      type: ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`,
    })

    // Call Whisper API
    console.log(`[auto-sync] Calling Whisper API for song "${song.title}" (${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`)
    const openai = new OpenAI({ apiKey })

    const whisperResponse = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
      language: song.language === 'he' ? 'he' : song.language === 'en' ? 'en' : undefined,
    })

    const words = (whisperResponse as any).words ?? []
    const segments = (whisperResponse as any).segments ?? []
    const transcription = whisperResponse.text ?? ''

    console.log(`[auto-sync] Whisper returned ${words.length} words, ${segments.length} segments`)

    if (words.length === 0 && segments.length === 0) {
      return NextResponse.json({
        error: 'Whisper returned no transcription. The audio might be instrumental or too noisy.',
      }, { status: 422 })
    }

    // Run alignment
    const alignResults = alignLyricsToTranscript(
      chunksWithLyrics.map((c) => ({ id: c.id, lyrics: c.lyrics, order: c.order })),
      words,
      segments,
    )

    // Save timestamps for each chunk
    for (const result of alignResults) {
      const timestampsJson = JSON.stringify(result.timestamps)
      await prisma.$executeRawUnsafe(
        'UPDATE "Chunk" SET "lineTimestamps" = $1 WHERE id = $2',
        timestampsJson,
        result.chunkId,
      )
    }

    console.log(`[auto-sync] Saved timestamps for ${alignResults.length} chunks`)

    invalidateSongsCache()
    return NextResponse.json({
      results: alignResults,
      transcription,
    })
  } catch (error: unknown) {
    console.error('POST /api/songs/[songId]/auto-sync error:', error)

    // Handle specific OpenAI errors
    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status: number; message?: string }
      if (apiError.status === 413) {
        return NextResponse.json(
          { error: 'Audio file is too large for Whisper API (max 25MB)' },
          { status: 413 }
        )
      }
      if (apiError.status === 401) {
        return NextResponse.json(
          { error: 'Invalid OpenAI API key' },
          { status: 401 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Auto-sync failed. Try manual sync as a fallback.' },
      { status: 500 }
    )
  }
}
