import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

    if (quota.freeSecondsUsed + recordingSeconds > quota.freeSecondsLimit) {
      return NextResponse.json(
        { error: '\u05D7\u05E8\u05D9\u05D2\u05EA \u05DE\u05DB\u05E1\u05D4 \u2014 \u05E0\u05D2\u05DE\u05E8 \u05D4\u05D6\u05DE\u05DF \u05D4\u05D7\u05D9\u05E0\u05DE\u05D9 \u05DC\u05E0\u05D9\u05EA\u05D5\u05D7 \u05E7\u05D5\u05DC\u05D9' },
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

    // Fire-and-forget: trigger the Python vocal analysis service
    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (vocalServiceUrl) {
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
    }

    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    console.error('[vocal-analysis/jobs POST]', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Job creation failed: ${msg}` }, { status: 500 })
  }
}
