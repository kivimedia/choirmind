import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/vocal-analysis/sessions/[sessionId]
// Full session details with all scores, coaching tips, problem areas
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await params
    const userId = session.user.id

    const vocalSession = await prisma.vocalPracticeSession.findUnique({
      where: { id: sessionId },
      include: {
        song: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    if (!vocalSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Allow owner or director of a choir the session owner belongs to
    if (vocalSession.userId !== userId) {
      const isDirector = await prisma.choirMember.findFirst({
        where: {
          userId,
          role: 'director',
          choir: {
            members: {
              some: { userId: vocalSession.userId },
            },
          },
        },
      })
      if (!isDirector) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json({ session: vocalSession })
  } catch (error) {
    console.error('[vocal-analysis/sessions/[sessionId] GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
