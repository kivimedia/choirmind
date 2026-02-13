import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/choir/[choirId] — get choir details
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

    const choir = await prisma.choir.findUnique({
      where: { id: choirId },
      include: {
        _count: { select: { members: true, songs: true } },
      },
    })

    if (!choir) {
      return NextResponse.json({ error: 'Choir not found' }, { status: 404 })
    }

    return NextResponse.json({ choir })
  } catch (error) {
    console.error('GET /api/choir/[choirId] error:', error)
    return NextResponse.json({ error: 'Failed to fetch choir' }, { status: 500 })
  }
}

// PATCH /api/choir/[choirId] — update choir settings (director only)
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
    const { name, locale, weekStart, leaderboardEnabled } = body

    const updateData: Record<string, unknown> = {}
    if (name && typeof name === 'string' && name.trim()) updateData.name = name.trim()
    if (locale && typeof locale === 'string') updateData.locale = locale
    if (weekStart && (weekStart === 'sunday' || weekStart === 'monday')) updateData.weekStart = weekStart
    if (typeof leaderboardEnabled === 'boolean') updateData.leaderboardEnabled = leaderboardEnabled

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const choir = await prisma.choir.update({
      where: { id: choirId },
      data: updateData,
    })

    return NextResponse.json({ choir })
  } catch (error) {
    console.error('PATCH /api/choir/[choirId] error:', error)
    return NextResponse.json({ error: 'Failed to update choir' }, { status: 500 })
  }
}

// DELETE /api/choir/[choirId] — delete choir (director only)
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

    // Delete choir (cascades to members, songs, etc.)
    await prisma.choir.delete({
      where: { id: choirId },
    })

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('DELETE /api/choir/[choirId] error:', error)
    return NextResponse.json({ error: 'Failed to delete choir' }, { status: 500 })
  }
}
