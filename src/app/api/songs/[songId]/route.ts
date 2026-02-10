import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/songs/[songId] — get single song with chunks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { songId } = await params

    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: {
        chunks: {
          orderBy: { order: 'asc' },
        },
        audioTracks: true,
      },
    })

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Verify access: user must be in the choir or own the personal song
    const userId = session.user.id
    if (song.isPersonal) {
      if (song.personalUserId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (song.choirId) {
      const membership = await prisma.choirMember.findUnique({
        where: {
          userId_choirId: { userId, choirId: song.choirId },
        },
      })
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json({ song })
  } catch (error) {
    console.error('GET /api/songs/[songId] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch song' },
      { status: 500 }
    )
  }
}

// PUT /api/songs/[songId] — update song
export async function PUT(
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

    const existingSong = await prisma.song.findUnique({
      where: { id: songId },
    })

    if (!existingSong) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Verify access
    if (existingSong.isPersonal) {
      if (existingSong.personalUserId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (existingSong.choirId) {
      const membership = await prisma.choirMember.findUnique({
        where: {
          userId_choirId: { userId, choirId: existingSong.choirId },
        },
      })
      if (!membership || membership.role !== 'director') {
        return NextResponse.json(
          { error: 'Only directors can edit choir songs' },
          { status: 403 }
        )
      }
    }

    const body = await request.json()
    const {
      title,
      composer,
      lyricist,
      arranger,
      language,
      textDirection,
      isMedley,
      spotifyTrackId,
      spotifyEmbed,
      targetDate,
      concertOrder,
      tags,
    } = body

    const song = await prisma.song.update({
      where: { id: songId },
      data: {
        ...(title !== undefined && { title }),
        ...(composer !== undefined && { composer }),
        ...(lyricist !== undefined && { lyricist }),
        ...(arranger !== undefined && { arranger }),
        ...(language !== undefined && { language }),
        ...(textDirection !== undefined && { textDirection }),
        ...(isMedley !== undefined && { isMedley }),
        ...(spotifyTrackId !== undefined && { spotifyTrackId }),
        ...(spotifyEmbed !== undefined && { spotifyEmbed }),
        ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
        ...(concertOrder !== undefined && { concertOrder }),
        ...(tags !== undefined && { tags: typeof tags === 'string' ? tags : JSON.stringify(tags) }),
      },
      include: {
        chunks: {
          orderBy: { order: 'asc' },
        },
      },
    })

    return NextResponse.json({ song })
  } catch (error) {
    console.error('PUT /api/songs/[songId] error:', error)
    return NextResponse.json(
      { error: 'Failed to update song' },
      { status: 500 }
    )
  }
}

// DELETE /api/songs/[songId] — delete song
export async function DELETE(
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

    const existingSong = await prisma.song.findUnique({
      where: { id: songId },
    })

    if (!existingSong) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Verify access
    if (existingSong.isPersonal) {
      if (existingSong.personalUserId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (existingSong.choirId) {
      const membership = await prisma.choirMember.findUnique({
        where: {
          userId_choirId: { userId, choirId: existingSong.choirId },
        },
      })
      if (!membership || membership.role !== 'director') {
        return NextResponse.json(
          { error: 'Only directors can delete choir songs' },
          { status: 403 }
        )
      }
    }

    await prisma.song.delete({ where: { id: songId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/songs/[songId] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete song' },
      { status: 500 }
    )
  }
}
