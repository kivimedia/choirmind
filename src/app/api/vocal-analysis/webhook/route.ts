import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateVocalXp } from '@/lib/xp'
import { checkAndUnlockAchievements } from '@/lib/achievement-checker'

// POST /api/vocal-analysis/webhook
// Python service callback (secret-protected)
// Body: { jobId, status, practiceSession?, errorMessage? }
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const webhookSecret = process.env.VOCAL_WEBHOOK_SECRET
    const headerSecret = request.headers.get('x-webhook-secret')

    if (!webhookSecret || headerSecret !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { jobId, status, practiceSession, errorMessage } = body

    if (!jobId || !status) {
      return NextResponse.json(
        { error: 'jobId and status are required' },
        { status: 400 },
      )
    }

    // Fetch the existing job
    const job = await prisma.vocalAnalysisJob.findUnique({
      where: { id: jobId },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (status === 'COMPLETED') {
      if (!practiceSession) {
        return NextResponse.json(
          { error: 'practiceSession data is required for COMPLETED status' },
          { status: 400 },
        )
      }

      // Calculate XP using centralized formula
      const overallScore = practiceSession.overallScore ?? 0

      // Fetch user streak for XP multiplier
      const user = await prisma.user.findUnique({
        where: { id: job.userId },
        select: { currentStreak: true },
      })
      const currentStreak = user?.currentStreak ?? 0

      // Fetch previous session for the same song to compute section improvement bonus
      const previousSession = await prisma.vocalPracticeSession.findFirst({
        where: { userId: job.userId, songId: job.songId },
        orderBy: { createdAt: 'desc' },
        select: { overallScore: true, sectionScores: true },
      })

      const currentSectionScores: { overallScore: number }[] = (() => {
        try {
          const raw = practiceSession.sectionScores
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          return Array.isArray(parsed) ? parsed : []
        } catch { return [] }
      })()

      const previousSectionScores: { overallScore: number }[] | undefined = (() => {
        if (!previousSession?.sectionScores) return undefined
        try {
          const raw = previousSession.sectionScores
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          return Array.isArray(parsed) ? parsed : undefined
        } catch { return undefined }
      })()

      const xpResult = calculateVocalXp({
        overallScore,
        currentSectionScores: currentSectionScores.length > 0 ? currentSectionScores : undefined,
        previousSectionScores,
        currentStreak,
      })
      const xpEarned = xpResult.totalXp

      await prisma.$transaction(async (tx) => {
        // Create VocalPracticeSession
        const newSession = await tx.vocalPracticeSession.create({
          data: {
            userId: job.userId,
            songId: job.songId,
            voicePart: job.voicePart,
            recordingS3Key: job.recordingS3Key,
            referenceVocalId: practiceSession.referenceVocalId ?? null,
            overallScore: practiceSession.overallScore,
            pitchScore: practiceSession.pitchScore,
            timingScore: practiceSession.timingScore,
            dynamicsScore: practiceSession.dynamicsScore,
            sectionScores: typeof practiceSession.sectionScores === 'string'
              ? practiceSession.sectionScores
              : JSON.stringify(practiceSession.sectionScores ?? []),
            problemAreas: typeof practiceSession.problemAreas === 'string'
              ? practiceSession.problemAreas
              : JSON.stringify(practiceSession.problemAreas ?? []),
            coachingTips: typeof practiceSession.coachingTips === 'string'
              ? practiceSession.coachingTips
              : JSON.stringify(practiceSession.coachingTips ?? []),
            xpEarned,
            durationMs: practiceSession.durationMs ?? job.recordingDurationMs,
          },
        })

        // Update job: link to practice session, mark completed
        await tx.vocalAnalysisJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            practiceSessionId: newSession.id,
            completedAt: new Date(),
          },
        })

        // Award XP to user
        await tx.user.update({
          where: { id: job.userId },
          data: {
            xp: { increment: xpEarned },
          },
        })

        // Check and unlock achievements
        await checkAndUnlockAchievements(tx, job.userId, {
          type: 'vocal_practice',
          songId: job.songId,
          overallScore,
          sectionScores: currentSectionScores,
          previousOverallScore: previousSession?.overallScore ?? undefined,
        })
      })

      return NextResponse.json({ success: true, status: 'COMPLETED' })
    }

    if (status === 'FAILED') {
      // Refund quota seconds
      const recordingSeconds = Math.ceil(job.recordingDurationMs / 1000)

      await prisma.$transaction(async (tx) => {
        // Update job status with error
        await tx.vocalAnalysisJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            errorMessage: errorMessage ?? 'Analysis failed',
            completedAt: new Date(),
          },
        })

        // Refund quota seconds
        await tx.userVocalQuota.update({
          where: { userId: job.userId },
          data: {
            freeSecondsUsed: { decrement: recordingSeconds },
          },
        })
      })

      return NextResponse.json({ success: true, status: 'FAILED' })
    }

    // Handle other status updates (e.g., PROCESSING)
    await prisma.vocalAnalysisJob.update({
      where: { id: jobId },
      data: {
        status,
        ...(status === 'PROCESSING' ? { startedAt: new Date(), attempts: { increment: 1 } } : {}),
      },
    })

    return NextResponse.json({ success: true, status })
  } catch (error) {
    console.error('[vocal-analysis/webhook POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
