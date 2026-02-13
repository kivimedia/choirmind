import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkAndUnlockAchievements } from '@/lib/achievement-checker'

// POST /api/vocal-analysis/jobs/[jobId]/check-achievements
// Called by frontend after polling detects COMPLETED for real mode.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId } = await params
    const userId = session.user.id

    const job = await prisma.vocalAnalysisJob.findUnique({
      where: { id: jobId },
      include: { practiceSession: true },
    })

    if (!job || job.userId !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (job.status !== 'COMPLETED' || !job.practiceSession) {
      return NextResponse.json({ error: 'Job not completed' }, { status: 400 })
    }

    const ps = job.practiceSession

    // Parse section scores
    let sectionScores: { overallScore: number }[] = []
    try {
      const parsed = JSON.parse(ps.sectionScores)
      sectionScores = Array.isArray(parsed) ? parsed : parsed.sections ?? []
    } catch {}

    // Get previous session for quick_learner check
    const previousSession = await prisma.vocalPracticeSession.findFirst({
      where: { userId, songId: job.songId, id: { not: ps.id } },
      orderBy: { createdAt: 'desc' },
      select: { overallScore: true },
    })

    const unlockedAchievements = await prisma.$transaction(async (tx) => {
      return checkAndUnlockAchievements(tx, userId, {
        type: 'vocal_practice',
        songId: job.songId,
        overallScore: ps.overallScore,
        sectionScores,
        previousOverallScore: previousSession?.overallScore,
      })
    })

    return NextResponse.json({ unlockedAchievements })
  } catch (error) {
    console.error('[check-achievements POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
