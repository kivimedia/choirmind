import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/songs — list songs for user's choir + personal songs
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get user's choir memberships
    const memberships = await prisma.choirMember.findMany({
      where: { userId },
      select: { choirId: true },
    })
    const choirIds = memberships.map((m) => m.choirId)

    // Check if archived songs were requested
    const showArchived = request.nextUrl.searchParams.get('archived') === 'true'

    // Optional choir filter
    const filterChoirId = request.nextUrl.searchParams.get('choirId')

    // Build the OR conditions for song query
    const orConditions: Record<string, unknown>[] = []
    if (filterChoirId) {
      // Only show songs from the specified choir (must be a member)
      if (choirIds.includes(filterChoirId)) {
        orConditions.push({ choirId: filterChoirId })
      }
      // Always include personal songs
      orConditions.push({ isPersonal: true, personalUserId: userId })
    } else {
      // Show all choirs the user belongs to
      orConditions.push({ choirId: { in: choirIds } })
      orConditions.push({ isPersonal: true, personalUserId: userId })
    }

    // Fetch choir songs + personal songs
    const songs = await prisma.song.findMany({
      where: {
        OR: orConditions,
        archivedAt: showArchived ? { not: null } : null,
      },
      include: {
        chunks: {
          orderBy: { order: 'asc' },
        },
        audioTracks: {
          select: { id: true, voicePart: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Supplement chunks with lineTimestamps via raw SQL (Prisma engine may not include new fields)
    try {
      const allChunkIds = songs.flatMap((s: any) => s.chunks.map((c: any) => c.id))
      if (allChunkIds.length > 0) {
        const placeholders = allChunkIds.map((_: string, i: number) => `$${i + 1}`).join(',')
        const rows = await prisma.$queryRawUnsafe<{ id: string; lineTimestamps: string | null }[]>(
          `SELECT id, "lineTimestamps" FROM "Chunk" WHERE id IN (${placeholders})`,
          ...allChunkIds
        )
        const tsMap = new Map(rows.map((r) => [r.id, r.lineTimestamps]))
        for (const song of songs) {
          for (const chunk of (song as any).chunks) {
            chunk.lineTimestamps = tsMap.get(chunk.id) ?? null
          }
        }
      }
    } catch {
      // Non-critical: sync badges won't show but everything else works
    }

    // Fetch user's favorites to annotate songs
    let favSet = new Set<string>()
    try {
      const songIds = songs.map((s) => s.id)
      const favorites = await prisma.userFavoriteSong.findMany({
        where: { userId, songId: { in: songIds } },
        select: { songId: true },
      })
      favSet = new Set(favorites.map((f) => f.songId))
    } catch {
      // UserFavoriteSong table may not exist yet if Prisma client hasn't been regenerated
    }

    const songsWithFavorites = songs.map((song) => ({
      ...song,
      isFavorited: favSet.has(song.id),
    }))

    return NextResponse.json({ songs: songsWithFavorites })
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

    return NextResponse.json({ song }, { status: 201 })
  } catch (error) {
    console.error('POST /api/songs error:', error)
    return NextResponse.json(
      { error: 'Failed to create song' },
      { status: 500 }
    )
  }
}
