import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/director/member-sessions?choirId=X&memberId=Y&limit=50
// Director-only: list a specific member's vocal practice sessions
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const choirId = request.nextUrl.searchParams.get('choirId')
    const memberId = request.nextUrl.searchParams.get('memberId')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20

    if (!choirId || !memberId) {
      return NextResponse.json({ error: 'choirId and memberId required' }, { status: 400 })
    }

    // Verify director access
    const directorMembership = await prisma.choirMember.findUnique({
      where: { userId_choirId: { userId, choirId } },
    })
    if (!directorMembership || directorMembership.role !== 'director') {
      return NextResponse.json({ error: 'Director access required' }, { status: 403 })
    }

    // Verify memberId belongs to this choir
    const targetMembership = await prisma.choirMember.findFirst({
      where: { choirId, user: { id: memberId } },
    })
    if (!targetMembership) {
      return NextResponse.json({ error: 'Member not found in choir' }, { status: 404 })
    }

    const sessions = await prisma.vocalPracticeSession.findMany({
      where: { userId: memberId },
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
    console.error('[director/member-sessions GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
