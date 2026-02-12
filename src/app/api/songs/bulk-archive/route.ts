import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/songs/bulk-archive — bulk archive or unarchive songs
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { songIds, action } = body

    if (!Array.isArray(songIds) || songIds.length === 0) {
      return NextResponse.json({ error: 'songIds must be a non-empty array' }, { status: 400 })
    }

    if (!['archive', 'unarchive'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Fetch all songs to verify access
    const songs = await prisma.song.findMany({
      where: { id: { in: songIds } },
      select: { id: true, choirId: true, isPersonal: true, personalUserId: true },
    })

    if (songs.length === 0) {
      return NextResponse.json({ error: 'No songs found' }, { status: 404 })
    }

    // Verify director role for each song
    const choirIds = [...new Set(songs.filter((s) => s.choirId).map((s) => s.choirId!))]
    const memberships = await prisma.choirMember.findMany({
      where: {
        userId,
        choirId: { in: choirIds },
        role: 'director',
      },
      select: { choirId: true },
    })
    const directorChoirIds = new Set(memberships.map((m) => m.choirId))

    const allowedSongIds: string[] = []
    for (const song of songs) {
      if (song.isPersonal) {
        if (song.personalUserId === userId) {
          allowedSongIds.push(song.id)
        }
      } else if (song.choirId && directorChoirIds.has(song.choirId)) {
        allowedSongIds.push(song.id)
      }
    }

    if (allowedSongIds.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update all allowed songs in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.song.updateMany({
        where: { id: { in: allowedSongIds } },
        data: {
          archivedAt: action === 'archive' ? new Date() : null,
        },
      })
      return updated.count
    })

    return NextResponse.json({ updated: result, songIds: allowedSongIds })
  } catch (error) {
    console.error('POST /api/songs/bulk-archive error:', error)
    return NextResponse.json(
      { error: 'Failed to bulk archive songs' },
      { status: 500 }
    )
  }
}
