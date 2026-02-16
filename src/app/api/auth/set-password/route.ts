import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword, validatePasswordStrength } from '@/lib/password'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { currentPassword, newPassword } = await request.json()

    if (!newPassword) {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 })
    }

    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) {
      return NextResponse.json({ error: strength.error }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { hashedPassword: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // If user already has a password, require and verify current password
    if (user.hashedPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'currentPasswordRequired' }, { status: 400 })
      }
      const valid = await verifyPassword(currentPassword, user.hashedPassword)
      if (!valid) {
        return NextResponse.json({ error: 'incorrectPassword' }, { status: 400 })
      }
    }

    const hashed = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: session.user.id },
      data: { hashedPassword: hashed },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/auth/set-password error:', error)
    return NextResponse.json({ error: 'Failed to set password' }, { status: 500 })
  }
}
