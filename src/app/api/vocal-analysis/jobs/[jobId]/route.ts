import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { calculateVocalXp } from '@/lib/xp'

// GET /api/vocal-analysis/jobs/[jobId]
// Poll job status. If COMPLETED, includes linked practiceSession with all scores.
// When a real-mode job transitions to COMPLETED, awards XP on the Next.js side.
export async function GET(
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
      include: {
        practiceSession: true,
      },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Only allow user to see their own jobs
    if (job.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // When polling detects COMPLETED and the Python service wrote the session
    // but XP hasn't been awarded yet by Next.js, award it now.
    // The Python service sets xpEarned on the session using its own formula,
    // but we recalculate with the centralized formula and update if needed.
    if (job.status === 'COMPLETED' && job.practiceSession) {
      const ps = job.practiceSession

      // Check if XP was already awarded by Next.js (mock mode does this inline)
      // For real mode, the Python service wrote the session but XP awarding
      // was removed from Python — we handle it here on first poll detect.
      const xpAwarded = request.nextUrl.searchParams.get('xpAwarded')
      if (xpAwarded !== 'true') {
        // Recalculate with centralized formula
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { currentStreak: true },
        })

        // Get previous session for improvement comparison
        const previousSession = await prisma.vocalPracticeSession.findFirst({
          where: { userId, songId: job.songId, id: { not: ps.id } },
          orderBy: { createdAt: 'desc' },
          select: { sectionScores: true },
        })
        let previousSectionScores: { overallScore: number }[] | undefined
        if (previousSession?.sectionScores) {
          try {
            const parsed = JSON.parse(previousSession.sectionScores)
            previousSectionScores = Array.isArray(parsed) ? parsed : parsed.sections
          } catch {}
        }

        let currentSectionScores: { overallScore: number }[] | undefined
        if (ps.sectionScores) {
          try {
            const parsed = JSON.parse(ps.sectionScores)
            currentSectionScores = Array.isArray(parsed) ? parsed : parsed.sections
          } catch {}
        }

        const xpResult = calculateVocalXp({
          overallScore: ps.overallScore,
          previousSectionScores,
          currentSectionScores,
          currentStreak: user?.currentStreak ?? 0,
        })

        // Update practice session XP and award to user
        await prisma.$transaction([
          prisma.vocalPracticeSession.update({
            where: { id: ps.id },
            data: { xpEarned: xpResult.totalXp },
          }),
          prisma.user.update({
            where: { id: userId },
            data: { xp: { increment: xpResult.totalXp } },
          }),
        ])

        // Return with xpAwarded flag so frontend stops re-awarding
        const updatedJob = await prisma.vocalAnalysisJob.findUnique({
          where: { id: jobId },
          include: { practiceSession: true },
        })

        return NextResponse.json({
          job: updatedJob,
          xpAwarded: true,
          xpBreakdown: xpResult.breakdown,
        })
      }
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('[vocal-analysis/jobs/[jobId] GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
