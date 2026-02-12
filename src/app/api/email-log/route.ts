import { NextResponse } from 'next/server'
import { getEmailLogs } from '@/lib/email'

// GET /api/email-log — View recent email logs
export async function GET() {
  try {
    const logs = await getEmailLogs()
    return NextResponse.json({ logs })
  } catch (error: any) {
    console.error('[EMAIL-LOG] Error:', error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
}
