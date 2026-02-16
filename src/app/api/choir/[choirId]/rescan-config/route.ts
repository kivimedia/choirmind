import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/choir/[choirId]/rescan-config — get rescan config
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ choirId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { choirId } = await params

    // Verify membership
    const membership = await prisma.choirMember.findUnique({
      where: { userId_choirId: { userId: session.user.id, choirId } },
    })
    if (!membership || membership.role !== 'director') {
      return NextResponse.json({ error: 'Director access required' }, { status: 403 })
    }

    const rows = await prisma.$queryRawUnsafe<{
      rescanUrl: string | null
      rescanDay: string | null
      rescanHour: number | null
      lastRescanAt: Date | null
    }[]>(
      'SELECT "rescanUrl", "rescanDay", "rescanHour", "lastRescanAt" FROM "Choir" WHERE id = $1',
      choirId
    )

    const config = rows[0] || { rescanUrl: null, rescanDay: null, rescanHour: null, lastRescanAt: null }
    return NextResponse.json({ config })
  } catch (error) {
    console.error('GET /api/choir/[choirId]/rescan-config error:', error)
    return NextResponse.json({ error: 'Failed to fetch rescan config' }, { status: 500 })
  }
}

// PUT /api/choir/[choirId]/rescan-config — save rescan config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ choirId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { choirId } = await params

    // Verify director access
    const membership = await prisma.choirMember.findUnique({
      where: { userId_choirId: { userId: session.user.id, choirId } },
    })
    if (!membership || membership.role !== 'director') {
      return NextResponse.json({ error: 'Director access required' }, { status: 403 })
    }

    const body = await request.json()
    const { rescanUrl, rescanDay, rescanHour } = body

    // Validate
    const validDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    if (rescanDay && !validDays.includes(rescanDay)) {
      return NextResponse.json({ error: 'Invalid rescan day' }, { status: 400 })
    }
    if (rescanHour !== null && rescanHour !== undefined && (rescanHour < 0 || rescanHour > 23)) {
      return NextResponse.json({ error: 'Invalid rescan hour (0-23)' }, { status: 400 })
    }

    await prisma.$executeRawUnsafe(
      'UPDATE "Choir" SET "rescanUrl" = $1, "rescanDay" = $2, "rescanHour" = $3 WHERE id = $4',
      rescanUrl || null,
      rescanDay || null,
      rescanHour ?? null,
      choirId
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/choir/[choirId]/rescan-config error:', error)
    return NextResponse.json({ error: 'Failed to save rescan config' }, { status: 500 })
  }
}
