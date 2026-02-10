import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/choir/join — join a choir with invite code
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { inviteCode, voicePart } = body

    if (!inviteCode) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      )
    }

    // Find choir by invite code (case-insensitive)
    const choir = await prisma.choir.findFirst({
      where: {
        inviteCode: inviteCode.toUpperCase().trim(),
      },
    })

    if (!choir) {
      return NextResponse.json(
        { error: 'Invalid invite code. Please check and try again.' },
        { status: 404 }
      )
    }

    // Check if already a member
    const existingMembership = await prisma.choirMember.findUnique({
      where: {
        userId_choirId: { userId, choirId: choir.id },
      },
    })

    if (existingMembership) {
      return NextResponse.json(
        { error: 'You are already a member of this choir' },
        { status: 409 }
      )
    }

    // Create membership and optionally update voice part in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const membership = await tx.choirMember.create({
        data: {
          userId,
          choirId: choir.id,
          role: 'member',
        },
      })

      // Update user's voice part if provided
      if (voicePart) {
        await tx.user.update({
          where: { id: userId },
          data: { voicePart },
        })
      }

      return membership
    })

    return NextResponse.json(
      {
        choir,
        membership: {
          role: result.role,
          joinedAt: result.joinedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/choir/join error:', error)
    return NextResponse.json(
      { error: 'Failed to join choir' },
      { status: 500 }
    )
  }
}
