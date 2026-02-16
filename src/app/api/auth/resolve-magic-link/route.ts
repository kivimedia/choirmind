import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { id } = await request.json()

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const redirect = await prisma.magicLinkRedirect.findUnique({
      where: { id },
    })

    if (!redirect) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }

    if (redirect.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 })
    }

    return NextResponse.json({ callbackUrl: redirect.callbackUrl })
  } catch (error) {
    console.error('[AUTH] resolve-magic-link error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
