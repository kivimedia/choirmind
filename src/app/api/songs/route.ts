import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getCachedSongs, invalidateSongsCache } from '@/lib/songs-cache'

// GET /api/songs — list songs for user's choir + personal songs
export async function GET(request: NextRequest) {
  const perfDebug = process.env.NEXT_PUBLIC_PERF_DEBUG === '1'
  const timings: Record<string, number> = {}
  const t0 = Date.now()

  try {
    let t = Date.now()
    const session = await getServerSession(authOptions)
    timings.session = Date.now() - t
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get user's choir memberships
    t = Date.now()
    const memberships = await prisma.choirMember.findMany({
      where: { userId },
      select: { choirId: true },
    })
    timings.memberships = Date.now() - t
    const choirIds = memberships.map((m) => m.choirId)

    // Check if archived songs were requested
    const showArchived = request.nextUrl.searchParams.get('archived') === 'true'

    // Optional choir filter
    const filterChoirId = request.nextUrl.searchParams.get('choirId')

    // Fetch cached songs + live favorites in parallel
    t = Date.now()
    const [cachedSongs, allFavorites] = await Promise.all([
      getCachedSongs(choirIds, filterChoirId, userId, showArchived),
      prisma.userFavoriteSong.findMany({
        where: { userId },
        select: { songId: true },
      }).catch(() => [] as { songId: string }[]),
    ])
    timings.songsAndFavorites = Date.now() - t

    const favSet = new Set(allFavorites.map((f) => f.songId))

    // Merge live favorites into cached song data
    const songsResponse = cachedSongs.map((song) => ({
      ...song,
      isFavorited: favSet.has(song.id),
    }))

    timings.total = Date.now() - t0
    if (perfDebug) {
      console.log('[PERF] GET /api/songs timings:', timings)
    }

    const response = NextResponse.json({ songs: songsResponse })
    response.headers.set(
      'Server-Timing',
      Object.entries(timings).map(([k, v]) => `${k};dur=${v}`).join(', ')
    )
    return response
  } catch (error) {
    console.error('GET /api/songs error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch songs' },
      { status: 500 }
    )
  }
}

// POST /api/songs — create song with chunks
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const {
      title,
      composer,
      lyricist,
      language = 'he',
      lyrics,
      chunks,
      isPersonal = false,
      choirId,
      youtubeVideoId,
    } = body

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json(
        { error: 'At least one chunk is required' },
        { status: 400 }
      )
    }

    // If choir song, verify user is a member of the choir
    if (choirId && !isPersonal) {
      const membership = await prisma.choirMember.findUnique({
        where: {
          userId_choirId: { userId, choirId },
        },
      })
      if (!membership) {
        return NextResponse.json(
          { error: 'You are not a member of this choir' },
          { status: 403 }
        )
      }
    }

    // Determine text direction from language
    const textDirection = language === 'en' ? 'ltr' : language === 'he' ? 'rtl' : 'auto'

    // Create song + chunks in a transaction
    const song = await prisma.$transaction(async (tx) => {
      const newSong = await tx.song.create({
        data: {
          title,
          composer: composer || null,
          lyricist: lyricist || null,
          language,
          textDirection,
          isPersonal,
          personalUserId: isPersonal ? userId : null,
          choirId: isPersonal ? null : choirId || null,
          youtubeVideoId: youtubeVideoId || null,
        },
      })

      // Create chunks
      await tx.chunk.createMany({
        data: chunks.map(
          (chunk: { label: string; chunkType: string; order: number; lyrics: string }) => ({
            songId: newSong.id,
            label: chunk.label,
            chunkType: chunk.chunkType || 'verse',
            order: chunk.order,
            lyrics: chunk.lyrics,
            textDirection,
          })
        ),
      })

      // Return the song with chunks
      return tx.song.findUnique({
        where: { id: newSong.id },
        include: {
          chunks: {
            orderBy: { order: 'asc' },
          },
        },
      })
    })

    invalidateSongsCache()
    return NextResponse.json({ song }, { status: 201 })
  } catch (error) {
    console.error('POST /api/songs error:', error)
    return NextResponse.json(
      { error: 'Failed to create song' },
      { status: 500 }
    )
  }
}
