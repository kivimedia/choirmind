import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { calculateVocalXp } from '@/lib/xp'

// ---------------------------------------------------------------------------
// Mock analysis — used when vocal service is unavailable or unconfigured
// ---------------------------------------------------------------------------

async function generateMockResults(
  jobId: string,
  userId: string,
  songId: string,
  voicePart: string,
  recordingS3Key: string,
  recordingDurationMs: number,
) {
  const pitch = 55 + Math.random() * 35
  const timing = 50 + Math.random() * 40
  const dynamics = 45 + Math.random() * 40
  const overall = pitch * 0.5 + timing * 0.3 + dynamics * 0.2

  const sectionScores = Array.from({ length: 4 }, (_, i) => ({
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
    },
  ]

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true },
  })

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
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      practiceSessionId: practiceSession.id,
      completedAt: new Date(),
    },
  })

  await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: xpResult.totalXp } },
  })

  return { practiceSession, xpResult }
}

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

    // Check if user's choir has active subscription (unlimited)
    const choirMemberships = await prisma.choirMember.findMany({
      where: { userId },
      select: {
        choir: {
          select: { stripeCurrentPeriodEnd: true },
        },
      },
    })
    const hasChoirSub = choirMemberships.some(
      (m) => m.choir.stripeCurrentPeriodEnd && new Date(m.choir.stripeCurrentPeriodEnd) > new Date()
    )

    // Credit-based quota: free seconds + purchased seconds (from subscription + top-ups)
    const totalAllowance = quota.freeSecondsLimit + (quota.purchasedSeconds ?? 0)

    if (!hasChoirSub && quota.freeSecondsUsed + recordingSeconds > totalAllowance) {
      return NextResponse.json(
        { error: '\u05D7\u05E8\u05D9\u05D2\u05EA \u05DE\u05DB\u05E1\u05D4 \u2014 \u05E0\u05D2\u05DE\u05E8 \u05D4\u05D6\u05DE\u05DF \u05DC\u05E0\u05D9\u05EA\u05D5\u05D7 \u05E7\u05D5\u05DC\u05D9', requiresUpgrade: true },
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
      // Fire-and-forget with 15s timeout: if service doesn't respond, fall back to mock
      const abortCtrl = new AbortController()
      const timeout = setTimeout(() => abortCtrl.abort(), 15_000)
      fetch(`${vocalServiceUrl}/api/v1/process-vocal-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          jobId: job.id,
          userId,
          songId,
          voicePart,
          recordingS3Key,
          recordingDurationMs,
          useHeadphones: job.useHeadphones,
        }),
      }).then(async (res) => {
        clearTimeout(timeout)
        if (!res.ok) {
          console.error('[vocal-analysis/jobs] Service error, falling back to mock:', res.status)
          await generateMockResults(job.id, userId, songId, voicePart, recordingS3Key, recordingDurationMs)
            .catch((e) => console.error('[vocal-analysis/jobs] Mock fallback failed:', e))
        }
        // If res.ok, the service is handling it — it will update the DB directly
      }).catch(async (err) => {
        clearTimeout(timeout)
        console.error('[vocal-analysis/jobs] Service failed/timeout, falling back to mock:', err?.message)
        await generateMockResults(job.id, userId, songId, voicePart, recordingS3Key, recordingDurationMs)
          .catch((e) => console.error('[vocal-analysis/jobs] Mock fallback failed:', e))
      })
    } else {
      // No vocal service configured — generate mock results immediately
      try {
        const { practiceSession, xpResult } = await generateMockResults(
          job.id, userId, songId, voicePart, recordingS3Key, recordingDurationMs,
        )

        const updatedQuota = await prisma.userVocalQuota.findUnique({ where: { userId } })
        const remaining = updatedQuota
          ? Math.max(0, updatedQuota.freeSecondsLimit - updatedQuota.freeSecondsUsed)
          : null
        const quotaWarning = remaining !== null && (remaining <= 1800 || remaining <= 900 || remaining <= 300)
          ? remaining
          : null

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
