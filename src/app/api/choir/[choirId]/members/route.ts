import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/choir/[choirId]/members — list members with roles
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
    const userId = session.user.id

    // Verify membership (or admin)
    const isAdmin = session.user.role === 'admin'
    if (!isAdmin) {
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId, choirId } },
      })
      if (!membership) {
        return NextResponse.json({ error: 'Not a member' }, { status: 403 })
      }
    }

    const members = await prisma.choirMember.findMany({
      where: { choirId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            voicePart: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })

    return NextResponse.json({ members })
  } catch (error) {
    console.error('GET /api/choir/[choirId]/members error:', error)
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
  }
}

// POST /api/choir/[choirId]/members — add member by email (director/admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ choirId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { choirId } = await params
    const userId = session.user.id

    // Check director role (or admin)
    const isAdmin = session.user.role === 'admin'
    if (!isAdmin) {
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId, choirId } },
      })
      if (!membership || membership.role !== 'director') {
        return NextResponse.json({ error: 'Director access required' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { email, role = 'member' } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    if (!['member', 'director'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Find user by email
    const targetUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found. They must sign up first.' }, { status: 404 })
    }

    // Check if already a member
    const existing = await prisma.choirMember.findUnique({
      where: { userId_choirId: { userId: targetUser.id, choirId } },
    })

    if (existing) {
      return NextResponse.json({ error: 'User is already a member of this choir' }, { status: 409 })
    }

    // Add to choir
    const member = await prisma.choirMember.create({
      data: {
        userId: targetUser.id,
        choirId,
        role,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, voicePart: true },
        },
      },
    })

    return NextResponse.json({ member }, { status: 201 })
  } catch (error) {
    console.error('POST /api/choir/[choirId]/members error:', error)
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }
}

// PATCH /api/choir/[choirId]/members — update member role (director only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ choirId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { choirId } = await params
    const userId = session.user.id

    // Check director role (or admin)
    const isAdmin = session.user.role === 'admin'
    if (!isAdmin) {
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId, choirId } },
      })
      if (!membership || membership.role !== 'director') {
        return NextResponse.json({ error: 'Director access required' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { memberId, role } = body

    if (!memberId || !role || !['member', 'director'].includes(role)) {
      return NextResponse.json({ error: 'Invalid memberId or role' }, { status: 400 })
    }

    const member = await prisma.choirMember.findFirst({
      where: { id: memberId, choirId },
    })

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const updated = await prisma.choirMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: {
          select: { id: true, name: true, email: true, voicePart: true },
        },
      },
    })

    return NextResponse.json({ member: updated })
  } catch (error) {
    console.error('PATCH /api/choir/[choirId]/members error:', error)
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 })
  }
}

// DELETE /api/choir/[choirId]/members — remove member (director only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ choirId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { choirId } = await params
    const userId = session.user.id

    // Check director role (or admin)
    const isAdmin = session.user.role === 'admin'
    if (!isAdmin) {
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId, choirId } },
      })
      if (!membership || membership.role !== 'director') {
        return NextResponse.json({ error: 'Director access required' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { memberId } = body

    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 })
    }

    const member = await prisma.choirMember.findFirst({
      where: { id: memberId, choirId },
    })

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // Prevent removing yourself
    if (member.userId === userId) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
    }

    await prisma.choirMember.delete({
      where: { id: memberId },
    })

    return NextResponse.json({ removed: true })
  } catch (error) {
    console.error('DELETE /api/choir/[choirId]/members error:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
