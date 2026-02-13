import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/vocal-analysis/sessions
// List user's vocal practice sessions
// Query params: songId (optional), limit (default 10)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const songId = request.nextUrl.searchParams.get('songId')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 100) : 10

    const sessions = await prisma.vocalPracticeSession.findMany({
      where: {
        userId,
        ...(songId ? { songId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        song: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('[vocal-analysis/sessions GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
