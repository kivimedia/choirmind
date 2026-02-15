import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/user/profile — get current user profile
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        locale: true,
        voicePart: true,
        role: true,
        shabbatMode: true,
        scoringLevel: true,
        xp: true,
        currentStreak: true,
        longestStreak: true,
        lastPracticeDate: true,
        createdAt: true,
        choirMemberships: {
          include: {
            choir: {
              select: {
                id: true,
                name: true,
                locale: true,
              },
            },
          },
        },
        _count: {
          select: {
            practiceSessions: true,
            achievements: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('GET /api/user/profile error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

// PUT /api/user/profile — update current user profile
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { name, voicePart, locale, shabbatMode, scoringLevel } = body

    // Validate scoring level if provided
    const validScoringLevels = ['choir', 'semi_pro', 'pro']
    if (scoringLevel !== undefined && !validScoringLevels.includes(scoringLevel)) {
      return NextResponse.json(
        {
          error: `Invalid scoring level. Must be one of: ${validScoringLevels.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate voice part if provided
    const validVoiceParts = [
      'soprano',
      'mezzo',
      'alto',
      'tenor',
      'baritone',
      'bass',
    ]
    if (voicePart !== undefined && voicePart !== null && !validVoiceParts.includes(voicePart)) {
      return NextResponse.json(
        {
          error: `Invalid voice part. Must be one of: ${validVoiceParts.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate locale if provided
    const validLocales = ['he', 'en', 'he-IL', 'en-US']
    if (locale !== undefined && !validLocales.includes(locale)) {
      return NextResponse.json(
        {
          error: `Invalid locale. Must be one of: ${validLocales.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(voicePart !== undefined && { voicePart }),
        ...(locale !== undefined && { locale }),
        ...(shabbatMode !== undefined && { shabbatMode }),
        ...(scoringLevel !== undefined && { scoringLevel }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        locale: true,
        voicePart: true,
        role: true,
        shabbatMode: true,
        scoringLevel: true,
        xp: true,
        currentStreak: true,
        longestStreak: true,
        lastPracticeDate: true,
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('PUT /api/user/profile error:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
