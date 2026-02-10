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

    // Fetch choir songs + personal songs
    const songs = await prisma.song.findMany({
      where: {
        OR: [
          { choirId: { in: choirIds } },
          { isPersonal: true, personalUserId: userId },
        ],
      },
      include: {
        chunks: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ songs })
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
