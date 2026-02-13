import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/vocal-analysis/references
// List references for a song
// Query param: songId (required)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const songId = request.nextUrl.searchParams.get('songId')

    if (!songId) {
      return NextResponse.json(
        { error: 'songId query parameter is required' },
        { status: 400 },
      )
    }

    const references = await prisma.referenceVocal.findMany({
      where: { songId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        songId: true,
        voicePart: true,
        sourceTrackId: true,
        isolatedFileUrl: true,
        featuresFileUrl: true,
        durationMs: true,
        demucsModel: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ references })
  } catch (error) {
    console.error('[vocal-analysis/references GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
