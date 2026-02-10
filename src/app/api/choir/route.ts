import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Avoid ambiguous chars: 0/O, 1/I
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// GET /api/choir — get user's choir(s)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    const memberships = await prisma.choirMember.findMany({
      where: { userId },
      include: {
        choir: {
          include: {
            _count: {
              select: { members: true, songs: true },
            },
          },
        },
      },
    })

    const choirs = memberships.map((m) => ({
      ...m.choir,
      role: m.role,
      joinedAt: m.joinedAt,
    }))

    return NextResponse.json({ choirs })
  } catch (error) {
    console.error('GET /api/choir error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch choirs' },
      { status: 500 }
    )
  }
}

// POST /api/choir — create a new choir
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { name, locale = 'he-IL', weekStart = 'sunday' } = body

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Choir name is required' },
        { status: 400 }
      )
    }

    // Generate a unique invite code
    let inviteCode = generateInviteCode()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.choir.findUnique({
        where: { inviteCode },
      })
      if (!existing) break
      inviteCode = generateInviteCode()
      attempts++
    }

    if (attempts >= 10) {
      return NextResponse.json(
        { error: 'Failed to generate unique invite code. Please try again.' },
        { status: 500 }
      )
    }

    // Create choir and make user a director in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const choir = await tx.choir.create({
        data: {
          name: name.trim(),
          inviteCode,
          locale,
          weekStart,
        },
      })

      await tx.choirMember.create({
        data: {
          userId,
          choirId: choir.id,
          role: 'director',
        },
      })

      return choir
    })

    return NextResponse.json(
      {
        choir: result,
        role: 'director',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/choir error:', error)
    return NextResponse.json(
      { error: 'Failed to create choir' },
      { status: 500 }
    )
  }
}
