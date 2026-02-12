import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/onboarding — join/create choir + set voice part
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { inviteCode, choirName, voicePart } = body

    await prisma.$transaction(async (tx) => {
      // Update voice part
      if (voicePart) {
        await tx.user.update({
          where: { id: userId },
          data: { voicePart },
        })
      }

      // Join existing choir
      if (inviteCode) {
        const choir = await tx.choir.findFirst({
          where: { inviteCode: inviteCode.toUpperCase().trim() },
        })

        if (!choir) {
          throw new Error('Invalid invite code')
        }

        const existing = await tx.choirMember.findUnique({
          where: { userId_choirId: { userId, choirId: choir.id } },
        })

        if (!existing) {
          await tx.choirMember.create({
            data: { userId, choirId: choir.id, role: 'member' },
          })
        }
      }

      // Create new choir
      if (choirName) {
        const code = choirName
          .replace(/[^a-zA-Zא-ת0-9]/g, '')
          .substring(0, 6)
          .toUpperCase() || 'CHOIR'
        const uniqueCode = `${code}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

        const choir = await tx.choir.create({
          data: {
            name: choirName.trim(),
            inviteCode: uniqueCode,
          },
        })

        await tx.choirMember.create({
          data: { userId, choirId: choir.id, role: 'director' },
        })

        // Make user a director
        await tx.user.update({
          where: { id: userId },
          data: { role: 'director' },
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('POST /api/onboarding error:', error)
    const message = error?.message === 'Invalid invite code'
      ? 'קוד הצטרפות לא תקין'
      : 'Failed to complete onboarding'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
