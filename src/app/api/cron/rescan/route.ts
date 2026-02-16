import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/cron/rescan — Vercel cron: check all choirs for scheduled rescans
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find choirs with rescan configured
    const choirs = await prisma.$queryRawUnsafe<{
      id: string
      rescanUrl: string
      rescanDay: string
      rescanHour: number
      lastRescanAt: Date | null
    }[]>(
      `SELECT id, "rescanUrl", "rescanDay", "rescanHour", "lastRescanAt"
       FROM "Choir"
       WHERE "rescanUrl" IS NOT NULL
         AND "rescanDay" IS NOT NULL
         AND "rescanHour" IS NOT NULL`
    )

    if (choirs.length === 0) {
      return NextResponse.json({ message: 'No choirs with rescan configured', triggered: 0 })
    }

    const now = new Date()
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const currentDay = dayNames[now.getUTCDay()]
    const currentHour = now.getUTCHours()

    let triggered = 0
    const results: { choirId: string; status: string }[] = []

    for (const choir of choirs) {
      // Check if current day/hour matches schedule
      if (choir.rescanDay !== currentDay || choir.rescanHour !== currentHour) {
        continue
      }

      // Check if already rescanned recently (within 23h)
      if (choir.lastRescanAt) {
        const hoursSinceLastRescan = (now.getTime() - new Date(choir.lastRescanAt).getTime()) / (1000 * 60 * 60)
        if (hoursSinceLastRescan < 23) {
          results.push({ choirId: choir.id, status: 'skipped_recent' })
          continue
        }
      }

      // Trigger rescan via internal API
      try {
        const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3001'

        const res = await fetch(`${baseUrl}/api/scan/rescan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ choirId: choir.id, _cronBypass: cronSecret }),
        })

        if (res.ok) {
          const data = await res.json()
          results.push({ choirId: choir.id, status: `imported_${data.imported}` })
          triggered++
        } else {
          results.push({ choirId: choir.id, status: 'error' })
        }
      } catch (err) {
        console.error(`[cron/rescan] Error for choir ${choir.id}:`, err)
        results.push({ choirId: choir.id, status: 'error' })
      }
    }

    return NextResponse.json({
      message: `Checked ${choirs.length} choirs, triggered ${triggered} rescans`,
      triggered,
      results,
    })
  } catch (error) {
    console.error('GET /api/cron/rescan error:', error)
    return NextResponse.json({ error: 'Cron rescan failed' }, { status: 500 })
  }
}
