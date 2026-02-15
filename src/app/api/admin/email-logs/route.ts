import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

// GET /api/admin/email-logs?search=X&limit=50&status=sent|failed
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    const conditions: Prisma.Sql[] = []

    if (search) {
      conditions.push(Prisma.sql`"to" ILIKE ${'%' + search + '%'}`)
    }
    if (status) {
      conditions.push(Prisma.sql`status = ${status}`)
    }

    const whereClause = conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty

    const logs = await prisma.$queryRaw<Array<{
      id: string
      to: string
      from: string
      subject: string
      status: string
      resendId: string | null
      error: string | null
      provider: string
      context: string
      createdAt: Date
    }>>`SELECT * FROM "EmailLog" ${whereClause} ORDER BY "createdAt" DESC LIMIT ${limit}`

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('[admin/email-logs]', error)
    return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 })
  }
}
