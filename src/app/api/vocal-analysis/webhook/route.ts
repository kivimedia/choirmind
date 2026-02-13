import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

      // Calculate XP: base on overall score
      const overallScore = practiceSession.overallScore ?? 0
      let xpEarned = 0
      if (overallScore >= 90) xpEarned = 25
      else if (overallScore >= 75) xpEarned = 20
      else if (overallScore >= 60) xpEarned = 15
      else if (overallScore >= 40) xpEarned = 10
      else xpEarned = 5

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
