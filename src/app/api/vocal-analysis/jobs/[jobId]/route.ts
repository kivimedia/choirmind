import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/vocal-analysis/jobs/[jobId]
// Poll job status. If COMPLETED, includes linked practiceSession with all scores.
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

    return NextResponse.json({ job })
  } catch (error) {
    console.error('[vocal-analysis/jobs/[jobId] GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
