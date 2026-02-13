import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { calculateVocalXp } from '@/lib/xp'

// POST /api/vocal-analysis/jobs
// Body: { songId, voicePart, recordingS3Key, recordingDurationMs, useHeadphones }
// Creates an analysis job and triggers the Python vocal service
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { songId, voicePart, recordingS3Key, recordingDurationMs, useHeadphones } = body

    if (!songId || !voicePart || !recordingS3Key || !recordingDurationMs) {
      return NextResponse.json(
        { error: 'songId, voicePart, recordingS3Key, and recordingDurationMs are required' },
        { status: 400 },
      )
    }

    // Check quota: get or create UserVocalQuota
    let quota = await prisma.userVocalQuota.findUnique({
      where: { userId },
    })

    if (!quota) {
      quota = await prisma.userVocalQuota.create({
        data: {
          userId,
          freeSecondsUsed: 0,
          freeSecondsLimit: 3600,
        },
      })
    }

    const recordingSeconds = Math.ceil(recordingDurationMs / 1000)

    // Check if user has active individual subscription (skip free limit)
    const hasIndividualSub = quota.stripeCurrentPeriodEnd
      && new Date(quota.stripeCurrentPeriodEnd) > new Date()

    // Check if user's choir has active subscription
    let hasChoirSub = false
    if (!hasIndividualSub) {
      const choirMemberships = await prisma.choirMember.findMany({
        where: { userId },
        select: {
          choir: {
            select: { stripeCurrentPeriodEnd: true },
          },
        },
      })
      hasChoirSub = choirMemberships.some(
        (m) => m.choir.stripeCurrentPeriodEnd && new Date(m.choir.stripeCurrentPeriodEnd) > new Date()
      )
    }

    const hasSubscription = hasIndividualSub || hasChoirSub

    if (!hasSubscription && quota.freeSecondsUsed + recordingSeconds > quota.freeSecondsLimit) {
      return NextResponse.json(
        { error: '\u05D7\u05E8\u05D9\u05D2\u05EA \u05DE\u05DB\u05E1\u05D4 \u2014 \u05E0\u05D2\u05DE\u05E8 \u05D4\u05D6\u05DE\u05DF \u05D4\u05D7\u05D9\u05E0\u05DE\u05D9 \u05DC\u05E0\u05D9\u05EA\u05D5\u05D7 \u05E7\u05D5\u05DC\u05D9', requiresUpgrade: true },
        { status: 402 },
      )
    }

    // Deduct seconds from quota
    await prisma.userVocalQuota.update({
      where: { userId },
      data: {
        freeSecondsUsed: { increment: recordingSeconds },
      },
    })

    // Create PENDING VocalAnalysisJob
    const job = await prisma.vocalAnalysisJob.create({
      data: {
        userId,
        songId,
        voicePart,
        recordingS3Key,
        recordingDurationMs,
        useHeadphones: useHeadphones ?? false,
        status: 'PENDING',
        attempts: 0,
      },
    })

    // Trigger the Python vocal analysis service
    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (vocalServiceUrl) {
      // Fire-and-forget: real service
      fetch(`${vocalServiceUrl}/api/v1/process-vocal-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          userId,
          songId,
          voicePart,
          recordingS3Key,
          recordingDurationMs,
          useHeadphones: job.useHeadphones,
        }),
      }).catch((err) => {
        console.error('[vocal-analysis/jobs] Failed to trigger vocal service:', err)
      })
    } else {
      // No vocal service configured — generate mock results immediately
      try {
        const pitch = 55 + Math.random() * 35
        const timing = 50 + Math.random() * 40
        const dynamics = 45 + Math.random() * 40
        const overall = pitch * 0.5 + timing * 0.3 + dynamics * 0.2

        const sectionScores = Array.from({length: 4}, (_, i) => ({
          sectionIndex: i,
          startTime: i * 5,
          endTime: (i + 1) * 5,
          overallScore: 40 + Math.random() * 50,
          pitchScore: 40 + Math.random() * 50,
          timingScore: 40 + Math.random() * 50,
          dynamicsScore: 40 + Math.random() * 50,
        }))

        const problemAreas = [
          {
            startTime: 5,
            endTime: 10,
            issues: ['pitch', 'timing'],
            avgPitchDevCents: 85 + Math.random() * 50,
            avgTimingOffsetMs: 60 + Math.random() * 80,
            avgEnergyRatio: 0.6 + Math.random() * 0.4,
          }
        ]

        // Fetch user for streak info
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { currentStreak: true },
        })

        // Get previous session scores for improvement bonus
        const previousSession = await prisma.vocalPracticeSession.findFirst({
          where: { userId, songId },
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

        // Calculate XP using centralized formula
        const xpResult = calculateVocalXp({
          overallScore: overall,
          previousSectionScores,
          currentSectionScores: sectionScores,
          currentStreak: user?.currentStreak ?? 0,
        })

        const practiceSession = await prisma.vocalPracticeSession.create({
          data: {
            userId,
            songId,
            voicePart,
            recordingS3Key,
            overallScore: Math.round(overall * 10) / 10,
            pitchScore: Math.round(pitch * 10) / 10,
            timingScore: Math.round(timing * 10) / 10,
            dynamicsScore: Math.round(dynamics * 10) / 10,
            sectionScores: JSON.stringify(sectionScores),
            problemAreas: JSON.stringify(problemAreas),
            coachingTips: JSON.stringify([
              'נסו לשמור על נשימה יציבה לאורך כל הפסוק',
              'שימו לב לדיוק הכניסות אחרי הפסקות',
              'עבדו על מעברים חלקים בין תווים גבוהים לנמוכים',
            ]),
            xpEarned: xpResult.totalXp,
            durationMs: recordingDurationMs,
          },
        })

        await prisma.vocalAnalysisJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            practiceSessionId: practiceSession.id,
            completedAt: new Date(),
          },
        })

        // Award XP
        await prisma.user.update({
          where: { id: userId },
          data: { xp: { increment: xpResult.totalXp } },
        })

        // Compute quota warning
        const updatedQuota = await prisma.userVocalQuota.findUnique({ where: { userId } })
        const remaining = updatedQuota
          ? Math.max(0, updatedQuota.freeSecondsLimit - updatedQuota.freeSecondsUsed)
          : null
        const quotaWarning = remaining !== null && (remaining <= 1800 || remaining <= 900 || remaining <= 300)
          ? remaining
          : null

        // Re-fetch the updated job to return COMPLETED status
        const updatedJob = await prisma.vocalAnalysisJob.findUnique({
          where: { id: job.id },
          include: { practiceSession: true },
        })
        return NextResponse.json({
          job: updatedJob,
          xpBreakdown: xpResult.breakdown,
          ...(quotaWarning !== null ? { quotaWarning, quotaRemaining: remaining } : {}),
        }, { status: 201 })
      } catch (err) {
        console.error('[vocal-analysis/jobs] Mock processing failed:', err)
        await prisma.vocalAnalysisJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', errorMessage: 'Mock processing error' },
        }).catch(() => {})
      }
    }

    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    console.error('[vocal-analysis/jobs POST]', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Job creation failed: ${msg}` }, { status: 500 })
  }
}
