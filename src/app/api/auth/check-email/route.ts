import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        hashedPassword: true,
        accounts: {
          select: { provider: true },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ exists: false, hasPassword: false, providers: [] })
    }

    return NextResponse.json({
      exists: true,
      hasPassword: !!user.hashedPassword,
      providers: user.accounts.map((a) => a.provider),
    })
  } catch (error) {
    console.error('POST /api/auth/check-email error:', error)
    return NextResponse.json({ error: 'Failed to check email' }, { status: 500 })
  }
}
