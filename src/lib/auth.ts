import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from 'next-auth/providers/email'
import { prisma } from './db'
import { sendEmail } from './email'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    // Email magic link via Resend
    EmailProvider({
      maxAge: 60 * 60, // 60 minutes (magic link expiry)
      from: process.env.EMAIL_FROM || 'ChoirMind <noreply@dailycookie.co>',
      sendVerificationRequest: async ({ identifier: email, url }) => {
        console.log(`[AUTH] sendVerificationRequest called for: ${email}`)
        console.log(`[AUTH] Magic link URL: ${url}`)

        const result = await sendEmail({
          to: email,
          subject: 'התחברות ל-ChoirMind',
          html: `
            <div dir="rtl" style="font-family: 'Heebo', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #fff;">
              <div style="text-align: center; margin-bottom: 32px;">
                <span style="font-size: 48px;">&#127925;</span>
                <h1 style="color: #6C5CE7; margin: 8px 0 4px; font-size: 28px;">ChoirMind</h1>
                <p style="color: #888; font-size: 14px; margin: 0;">שינון שירים מבוסס מדע למקהלות</p>
              </div>
              <div style="background: #F8F7FF; border-radius: 12px; padding: 24px; text-align: center;">
                <p style="font-size: 16px; color: #333; margin: 0 0 20px;">
                  לחצו על הכפתור כדי להתחבר לחשבון:
                </p>
                <a href="${url}"
                   style="display: inline-block; background: #6C5CE7; color: #fff; font-size: 16px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
                  התחברות ל-ChoirMind
                </a>
                <p style="font-size: 12px; color: #999; margin: 20px 0 0;">
                  הקישור תקף ל-60 דקות. אם לא ביקשתם להתחבר, התעלמו מהודעה זו.
                </p>
              </div>
              <p style="font-size: 11px; color: #ccc; text-align: center; margin-top: 24px;">
                &copy; ChoirMind ${new Date().getFullYear()}
              </p>
            </div>
          `,
          context: 'magic-link',
          metadata: { url },
        })

        if (!result.success) {
          throw new Error(`Failed to send verification email: ${result.error}`)
        }
      },
    }),
    // Google OAuth (configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env)
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id
      }
      // Populate role/voicePart/locale on sign-in or explicit update()
      if (user || trigger === 'update') {
        const start = Date.now()
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true, voicePart: true, locale: true },
        })
        if (dbUser) {
          let role = dbUser.role
          if (role !== 'director' && role !== 'admin') {
            const directorMembership = await prisma.choirMember.findFirst({
              where: { userId: token.sub, role: 'director' },
              select: { id: true },
            })
            if (directorMembership) {
              role = 'director'
            }
          }
          token.role = role
          token.voicePart = dbUser.voicePart
          token.locale = dbUser.locale
        }
        if (process.env.NEXT_PUBLIC_PERF_DEBUG === '1') {
          console.log(`[PERF] jwt callback DB queries: ${Date.now() - start}ms`)
        }
      }
      return token
    },
    async session({ session, token }) {
      // Zero DB queries — just copy cached values from JWT
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.role = token.role
        session.user.voicePart = token.voicePart
        session.user.locale = token.locale
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
  },
}
