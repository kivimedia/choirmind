import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/songs/[songId]/status — get processing status
export async function GET(
  _request: NextRequest,
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
      select: {
        processingStatus: true,
        processingStage: true,
        processingError: true,
      },
    })

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: song.processingStatus,
      stage: song.processingStage,
      errorMessage: song.processingError,
    })
  } catch (error) {
    console.error('GET /api/songs/[songId]/status error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
