import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/songs/[songId]/favorite — toggle favorite
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

    // Check if favorite exists
    const existing = await prisma.userFavoriteSong.findUnique({
      where: {
        userId_songId: { userId, songId },
      },
    })

    if (existing) {
      // Remove favorite
      await prisma.userFavoriteSong.delete({
        where: { id: existing.id },
      })
      return NextResponse.json({ favorited: false })
    } else {
      // Add favorite
      await prisma.userFavoriteSong.create({
        data: { userId, songId },
      })
      return NextResponse.json({ favorited: true })
    }
  } catch (error) {
    console.error('POST /api/songs/[songId]/favorite error:', error)
    return NextResponse.json(
      { error: 'Failed to toggle favorite' },
      { status: 500 }
    )
  }
}
