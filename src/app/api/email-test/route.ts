import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

// POST /api/email-test — Send a test email directly via Resend (admin only)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { to } = await request.json()

    if (!to) {
      return NextResponse.json({ error: 'Missing "to" email address' }, { status: 400 })
    }

    console.log(`[EMAIL-TEST] Sending test email to: ${to}`)

    const result = await sendEmail({
      to,
      subject: 'ChoirMind - בדיקת אימייל',
      html: `
        <div dir="rtl" style="font-family: 'Heebo', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #fff;">
          <div style="text-align: center; margin-bottom: 32px;">
            <span style="font-size: 48px;">&#9989;</span>
            <h1 style="color: #6C5CE7; margin: 8px 0 4px; font-size: 28px;">ChoirMind</h1>
            <p style="color: #888; font-size: 14px; margin: 0;">בדיקת שליחת אימייל</p>
          </div>
          <div style="background: #F0FFF0; border-radius: 12px; padding: 24px; text-align: center;">
            <p style="font-size: 16px; color: #333; margin: 0;">
              אם אתם רואים הודעה זו, שליחת האימייל עובדת!
            </p>
            <p style="font-size: 12px; color: #999; margin: 16px 0 0;">
              נשלח ב: ${new Date().toISOString()}
            </p>
          </div>
        </div>
      `,
      context: 'test',
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[EMAIL-TEST] Error:', error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
}
