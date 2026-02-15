import { Resend } from 'resend'
import { prisma } from './db'

const resend = new Resend(process.env.RESEND_API_KEY)

interface SendEmailParams {
  to: string
  subject: string
  html: string
  context?: string
  metadata?: Record<string, string>
}

export async function sendEmail({ to, subject, html, context = 'magic-link', metadata }: SendEmailParams) {
  const from = process.env.EMAIL_FROM || 'ChoirMind <noreply@dailycookie.co>'

  console.log(`[EMAIL] Attempting to send email:`)
  console.log(`[EMAIL]   To: ${to}`)
  console.log(`[EMAIL]   From: ${from}`)
  console.log(`[EMAIL]   Subject: ${subject}`)
  console.log(`[EMAIL]   Context: ${context}`)
  console.log(`[EMAIL]   API Key present: ${!!process.env.RESEND_API_KEY}`)
  console.log(`[EMAIL]   API Key prefix: ${process.env.RESEND_API_KEY?.substring(0, 10)}...`)

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
    })

    console.log(`[EMAIL] Resend response:`, JSON.stringify(result, null, 2))

    // Log to DB
    const metadataJson = metadata ? JSON.stringify(metadata) : null
    await prisma.$executeRaw`
      INSERT INTO "EmailLog" (id, "to", "from", subject, status, "resendId", error, provider, context, metadata, "createdAt")
      VALUES (${crypto.randomUUID()}, ${to}, ${from}, ${subject}, 'sent', ${(result as any).data?.id || null}, ${null}, 'resend', ${context}, ${metadataJson}, NOW())
    `

    return { success: true, data: result }
  } catch (error: any) {
    const errorMessage = error?.message || String(error)
    console.error(`[EMAIL] FAILED:`, errorMessage)
    console.error(`[EMAIL] Full error:`, JSON.stringify(error, null, 2))

    // Log failure to DB
    try {
      const metadataJson = metadata ? JSON.stringify(metadata) : null
      await prisma.$executeRaw`
        INSERT INTO "EmailLog" (id, "to", "from", subject, status, "resendId", error, provider, context, metadata, "createdAt")
        VALUES (${crypto.randomUUID()}, ${to}, ${from}, ${subject}, 'failed', ${null}, ${errorMessage}, 'resend', ${context}, ${metadataJson}, NOW())
      `
    } catch (logErr) {
      console.error(`[EMAIL] Failed to log to DB:`, logErr)
    }

    return { success: false, error: errorMessage }
  }
}

export async function getEmailLogs() {
  const logs = await prisma.$queryRaw`
    SELECT * FROM "EmailLog" ORDER BY "createdAt" DESC LIMIT 50
  `
  return logs
}
